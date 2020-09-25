window.seamstress =
  window.seamstress ||
  (function () {
    "use strict";

    const config = {
      target: "container",
      loadSamePage: false,
      hiddenClass: "seamstress__hidden",
      handleLinks: true,
      handleHistory: true,
      pushState: true,
      reloadOnError: true,
    };

    const setProp = (obj, prop, value, writable = false) =>
      Object.defineProperty(obj, prop, { value, writable, enumerable: true });

    const RELOAD_TOKEN = Symbol();
    const COMPLETED = Symbol();

    const events = {};
    const eventFactory = function (resultInterpreter = () => true) {
      let handlers = [];
      let pageHandlers = [];
      return [
        {
          /* important: runs async handlers in parallel! */
          invokeAll(invocationArgs, extraHandlers = []) {
            return Promise.all(
              [...extraHandlers, ...pageHandlers, ...handlers].map((f) =>
                Promise.resolve(f(...invocationArgs))
              )
            );
          },
          async invoke(invocationArgs, extraHandlers = []) {
            for (let handler of [
              ...extraHandlers,
              ...pageHandlers,
              ...handlers,
            ]) {
              let result = await Promise.resolve(handler(...invocationArgs)); // I think you don't need Promise.resolve here?
              if (!resultInterpreter(result)) return result;
            }
            return COMPLETED;
          },
          resetPage() {
            pageHandlers = [];
          },
          removeAll() {
            pageHandlers = [];
            handlers = [];
          },
        },
        {
          add(fn) {
            handlers.push(fn);
          },
          addPage(fn) {
            pageHandlers.push(fn);
          },
          remove(fn) {
            handlers = handlers.filter((h) => h !== fn);
            pageHandlers = pageHandlers.filter((h) => h !== fn);
          },
        },
      ];
    };

    const [beforeNavigateKey, beforeNavigate] = eventFactory(
      (r) => r === undefined || (r && r !== RELOAD_TOKEN)
    );
    setProp(events, "beforeNavigate", beforeNavigate);
    const [beforeUnmountKey, beforeUnmount] = eventFactory();
    setProp(events, "beforeUnmount", beforeUnmount);

    // not exposing afterUnmount, but used internally for
    // onPageUnmount to ensure it can run even if another navigation
    // occurs immediately
    const [afterUnmountKey, afterUnmount] = eventFactory();
    setProp(events, "afterUnmount", afterUnmount);

    const [afterMountKey, afterMount] = eventFactory();
    setProp(events, "afterMount", afterMount);
    const [afterNavigateKey, afterNavigate] = eventFactory();
    setProp(events, "afterNavigate", afterNavigate);
    const [onErrorKey, onError] = eventFactory();
    setProp(events, "onError", onError);

    const evtwrap = (h) => (h ? (Array.isArray(h) ? h : [h]) : []);

    let currentPage = location.pathname;
    let inNavigation = false;
    let navigationBlocked = false;
    let navigationTarget;
    let hasNavigated = false;

    const navigate = async function (url, options = {}) {
      // skip navigation if it's the page we're already on.
      // might not catch everything if
      let opts = Object.assign({ url }, config, options);
      const navigationEventToken = Symbol(url);
      setProp(opts, "navigationEventToken", navigationEventToken);

      if (url === currentPage && !config.loadSamePage) return false;
      if (inNavigation && navigationTarget === url) return false;
      if (navigationBlocked) return false;

      inNavigation = true;
      let setBlocked = false;
      navigationTarget = url;

      try {
        // run beforeNavigate handlers
        let result = await beforeNavigateKey.invoke(
          [opts],
          evtwrap(opts.beforeNavigate)
        );

        if (navigationTarget !== url) return; // exit early if possible

        if (result === RELOAD_TOKEN) {
          // some handler requested hard reload - invoke beforeUnmount
          await beforeUnmountKey.invokeAll(
            [null, null, opts],
            evtwrap(opts.beforeUnmount)
          );
          // engage!
          location.href = url;
          return; // doesn't really matter
        } else if (result !== COMPLETED) {
          return false;
        }

        const $oldNode = document.getElementById(opts.target);
        if (!$oldNode) {
          throw new Error("target node not found on current page");
        }
        if (navigationTarget !== url) return false; // exit early if possible

        hasNavigated = true;
        let $newNode, $scripts;

        const response = await fetch(opts.url);
        if (navigationTarget !== url) return false; // exit early if possible
        const responseText = await response.text();
        if (navigationTarget !== url) return false; // exit early if possible
        const $page = new DOMParser().parseFromString(
          responseText,
          "text/html"
        );
        $newNode = $page.getElementById(opts.destTarget || opts.target);
        if ($newNode === null) {
          throw new Error("target node not found on destination page");
        }
        $scripts = $page.querySelectorAll("script[data-seamstress-activate]");

        // this navigation is happening!
        beforeNavigateKey.resetPage();

        // block new navigations during transition
        navigationBlocked = true;
        setBlocked = true;
        try {
          // mount new page
          $newNode.classList.add(opts.hiddenClass);
          $oldNode.parentNode.insertBefore($newNode, $oldNode.nextSibling);

          // don't
          if (options.automatic !== "history" && !options.pushState) {
            history.pushState({}, "", url);
          }

          currentPage = url;

          // run js on new page
          for (let $script of $scripts) {
            let $sc = document.createElement("script");
            $sc.textContent = $script.textContent;
            if ($script.src) $sc.src = $script.src; // does this work?
            document.body.appendChild($sc);
          }

          // run afterMount handler
          await afterMountKey.invokeAll(
            [$newNode, $oldNode, opts],
            evtwrap(opts.afterMount)
          );
          afterMountKey.resetPage();

          // run transition
          $newNode.classList.remove(opts.hiddenClass);
          if (opts.transition) await opts.transition($oldNode, $newNode);
          $oldNode.classList.add(opts.hiddenClass);

          // run beforeUnmount handler
          await beforeUnmountKey.invokeAll(
            [$newNode, $oldNode, opts],
            evtwrap(opts.beforeUnmount)
          );
          beforeUnmountKey.resetPage();

          // allows a new page to set beforeUnmount handlers asap
          // using onPageUnmount
          await afterUnmountKey.invokeAll([opts], []);
          afterUnmountKey.resetPage();

          $oldNode.parentNode.removeChild($oldNode);

          navigationBlocked = false;
          setBlocked = false;
        } catch (e) {
          // at least attempt to cleanup before throwing
          if ($oldNode.parentNode === $newNode.parentNode) {
            $oldNode.parentNode.removeChild($oldNode);
            $newNode.classList.remove(opts.hiddenClass);
          }
          throw e;
        }

        await afterNavigateKey.invokeAll(
          [$newNode, opts],
          evtwrap(opts.afterNavigate)
        );

        afterNavigateKey.resetPage();

        return true;
      } catch (e) {
        let reload = opts.reloadOnError;
        e = e || {};
        e.preventReload = () => {
          reload = false;
        };
        e.requestReload = () => {
          reload = true;
        };
        onErrorKey.invokeAll([e, opts], evtwrap(opts.onError));
        if (reload) {
          location.href = opts.url;
        }
        return false;
      } finally {
        if (navigationTarget === url) {
          inNavigation = false;
          if (setBlocked) navigationBlocked = false;
        }
      }
    };

    document.addEventListener("click", (e) => {
      if (!config.handleLinks) return;

      let $target = e.target;
      while (
        $target &&
        $target !== document.body &&
        !($target.tagName === "A" && $target.href)
      ) {
        $target = $target.parentNode;
      }
      if (!$target) return;
      if ($target.tagName !== "A") return;
      if ($target.origin !== location.origin) return; // apply to same-origin links only
      if ($target.target) return; // any target attribute: not for us
      if ("seamstressIgnore" in $target.dataset) return;

      navigate($target.pathname, {
        automatic: "link",
        event: e,
      });
      e.preventDefault();
    });

    window.addEventListener("popstate", (e) => {
      if (config.handleHistory && location.pathname !== currentPage) {
        navigate(location.pathname, {
          automatic: "history",
          event: e,
        });
      }
    });

    const ifLoading = (fn) => inNavigation && fn();

    const setConfig = (newConfig) => Object.assign(config, newConfig);

    const getConfig = () => ({ ...config });

    const root = {};
    setProp(root, "events", events);
    setProp(root, "RELOAD", RELOAD_TOKEN);
    setProp(root, "navigate", navigate);
    setProp(root, "setConfig", setConfig);
    setProp(root, "getConfig", getConfig);
    setProp(root, "ifLoading", ifLoading);

    setProp(root, "onPageMount", (h, immediate = true) =>
      hasNavigated
        ? afterMount.addPage(h)
        : immediate &&
          h(document.getElementById(config.target), null, getConfig())
    );
    setProp(root, "onPageUnmount", (h) =>
      hasNavigated
        ? afterUnmount.addPage(() => beforeUnmount.addPage(h))
        : beforeUnmount.addPage(h)
    );

    return root;
  })();
