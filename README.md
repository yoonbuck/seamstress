# 🧵 seamstress

✨ easy peasy SPA-ification ✨

seamstress turns your boring, old-fashioned website into a shiny,
new-fashioned single-page website through the power of javascript 🤖

# a warning

seamstress is new and I am a fool. it is probably not very good and also almost
certainly has all sorts of security holes. the api will also probably change.

basically, probably don't use this.

# how to

Drop seamstress on every page on your site. seamstress will automatically
capture clicks on links to the same site, load the new page, and swap out the content.

```html
<script src="//path/to/seamstress.js"></script>
```

By default, seamstress will swap out your pages at the node with the
id `container`. So, you'll want to have pages that are structured like this.

```html
<!DOCTYPE html>
<html>
  <head>
    ...
  </head>
  <body>
    <!-- global stuff - nav, whatever. won't be replaced by seamstress -->
    <header>
      ...
    </header>

    <!-- seamstress will replace this entire node -->
    <div id="container">
      <h1>My super cool page</h1>
      ...
    </div>

    <script src="//path/to/seamstress.js"></script>
  </body>
</html>
```

If you want to replace everything, you can probably put this on `<body>` or maybe even
`<html>`. I haven't tried doing that. It might also fail spectacularly.

If you're already using a different id for your main content element, you can
tell seamstress to look for that.

```html
<div id="content">
  <!-- stuff to replace -->
</div>

<script src="//path/to/seamstress.js"></script>
<script>
  seamstress.setConfig({ target: "content" });
</script>
```

Right now, seamstress won't automatically update the `<title>` of the page for you,
but it probably should. I'll add that soon.

## exceptions

seamstress will always ignore links with the `target` property, so links that open in a new page
(and any horrifying iframe contraption you've set up) will behave the same. seamstress only works
on links that are same-origin, so links to content on other domains will behave the same.

If you need seamstress to ignore specific links, you can add the `data-seamstress-ignore` attribute.

If you want to turn off automatic capturing of link clicks entirely, use:

```js
seamstress.setConfig({ handleLinks: false })
```

## history

seamstress also handles navigations for history actions (e.g., when the user presses the browser's back button).
You can also disable this:

```js
seamstress.setConfig({ handleHistory: false })
```

seamstress makes no attempt to do anything even remotely related to scroll restoration. Usually what the browser
does is good enough. If you need something more, it's your problem.

## transitions

seamstress won't do transitions for you, but it allows you to bring your own.

```js
seamstress.setConfig({
  transition: async function(oldNode, newNode) {
    // do something with oldNode and newNode, and return when the transition is over
  }
})
```

## triggering navigation

Sometimes it might be useful to trigger navigation from other scripts, so you can do that.

```js
seamstress.navigate("/path/to/new/page")
```

You can pass in additional options in the second parameter, such as a custom transition or event handlers
for this navigation only:

```js
seamstress.navigate("/path/to/new/page", {
  destTarget: "content",
  transition: async function (newNode, oldNode) {...} ,
  beforeUnmount: function (newNode, oldNode, options) {...},
  ...
})
```

`seamstress.navigate` will asynchronously return whether the navigation was successful.

```js
const success = await seamstress.navigate(...)
```

## running javascript

Javascript you include on the target page won't be run, unless you explicitly
tell seamstress to do so using `data-seamstress-activate`. I think this works for
external scripts using `src`, but to be honest, I haven't actually tried that yet.

```html
<script>
  console.log("I'll only be run if you load the page directly");
</script>

<script data-seamstress-activate>
  console.log("I'll also run when you navigate to this page from another.");
</script>
```

You may want to be able to run code when pages are loaded and unloaded.
You can use `seamstress.onPageMount` and `seamstress.onPageUnmount` for this.

```html
<script data-seamstress-activate>
  seamstress.onPageMount(function(newNode, oldNode, options) {
    // set up event listeners, or whatever
    // newNode is the node which was just inserted into the page.
    // oldNode is the one which will soon be removed.
    // options is the configuration seamstress is using for the ongoing navigation.
  })
  seamstress.onPageUnmount(function(newNode, oldNode, options) {
    // clean up, or whatever
    // oldNode hasn't been removed from the page yet, but will be right after.
  })
</script>
```

You can pass in asynchronous functions if you want, and seamstress will wait for you,
but in general it's probably better not to. If you do, you might
have periods where both old and new content are present on the page at the same time.

seamstress applies the class `seamstress__hidden` to a node which is being mounted
or unmounted, so you can hide them to prevent this.

```css
.seamstress__hidden {
    display: none;
}
```

If you want, you can also change the class name used to hide nodes during these overlap periods.

```js
seamstress.setConfig({ hiddenClass: "custom-class-name" })
```

By default, the function you pass in to onPageMount will be run immediately if the page just loaded.
To prevent this and only run the handler if the page is being loaded as part of a seamstress-powered
navigation, pass in `false` as the second parameter.

```js
seamstress.onPageMount(function(newNode, oldNode, options) {
    ...
}, false)
```

## events

seamstress provides the ability to listen for a variety of events.

During a navigation, they are dispatched in the order they are listed in this reference.

#### `beforeNavigate`
Called before a navigation event occurs. Handlers can cancel the navigation or ask for browser navigation instead.

```js
seamstress.events.beforeNavigate.add(function(options)) {
  // options.url contains the url we are navigating to
  // if this navigation occured because of a link click,
  //   then options.automatic === "link"
  // if this navigation occured because of a history event (i.e., user clicked back button)
  //   then options.automatic === "history"
  // in either case, the event that caused this is available at options.event.

  // additionally, options itself is mutable and changes will affect this navigation,
  // but will not affect future navigations.

  // return false to cancel navigation.
  // return seamstress.RELOAD to force a full browser reload.
})
```

#### `afterMount`
Called after the new page's node is added to the document, but before it is visible.

```js
seamstress.events.afterMount.add(function(newNode, oldNode, options)) {
  ...
}
```

#### `beforeUnmount`
Called before the old page's node is removed from the document.

```js
seamstress.events.beforeUnmount.add(function(newNode, oldNode, options)) {
  ...
}
```

If a `beforeNavigate` handler requested a browser reload, newNode and oldNode will be `null`.

#### `afterNavigate`
Called after the entire navigation is finished successfully.

```js
seamstress.events.afterNavigate.add(function(newNode, options)) {
  ...
}
```

### Page events

Calling `.add()` will add an event listener that is called for all future navigations. Use `.remove()` to remove that event listener. To add listeners that only last for the duration of the current page, use `.addPage()`, for example:

```js
seamstress.events.beforeNavigate.addPage(function(options)) {
  // this will only be called while still on the current page.
})
```

Note that the `.addPage` behavior may be unexpected during a navigation. For example, if a new page uses `beforeUnmount.addPage()` to add own unmount handlers as it is loaded, the handler will actually trigger for the current outgoing page, instead of on the next navigation, as `beforeUnmount` doesn't occur until *after* the new page is loaded and its scripts are run. Use `seamstress.onPageMount` and `seamstress.onPageUnmount` instead as they provide the expected behavior.

### Dispatch order

Listeners for all events are dispatched in the following order:

1. Navigation-only listeners added while calling `navigate()` or added to `options` by a previous listener
1. Page-only listeners added using `seamstress.events.*.addPage()`
1. Global listeners added using `seamstress.events.*.add()`

### Async listeners

You can pass asynchronous handlers for any of these events, and the navigation will wait until they are complete, though you should strive to ensure any delay is minimal. See the note above about overlapping content visibility during long navigations.

Async listeners are dispatched in parallel, except for `beforeNavigate`, where listeners are run sequentially in the order listed above. In this case, when any listener returns `false` or `seamstress.RELOAD`, no further listeners are run.

### Changing options

Configuration options are copied from seamstress's global config at the beginning of a
navigation, so calls to `seamstress.setConfig` will not affect the current navigation.
To change options for the current navigation, mutate the `options` object passed to each
event handler. These changes will be persisted throughout the navigation and used
by seamstress as needed.

Note: seamstress automatically adds `options.url` to be the URL to which navigation
was requested. Modifying this property will change the URL that is used to fetch
the resource, but the original URL will be stored by seamstress's as the current page,
and will be shown in the user's address bar. (This behavior is subject to—and almost
certain to—change.)

### Distinguishing navigation events

You can store data on the `options` object as needed, but if this isn't sufficient,
you can determine which navigation an event belongs by looking at the `navigationEventToken`
property of the `options` parameter passed to event handlers. This is a unique
`Symbol` per navigation, and will be the same for all events fired throughout the
process of a navigation. For example, you might use this as the key of a `WeakMap`
to store additional properties that you can look up in later event handlers.

## Error handling

By default, if an error is thrown by one any event handler, or raised by any other
part of the loading process (such as a failed network request, or missing target
on the old or new page), seamstress will fallback to letting the browser navigate
to the desired page. To disable this globally, use:

```js
seamstress.setConfig({ reloadOnError: false })
```

For more control and greater visibility into errors, you can register an event
handler for errors.

```js
seamstress.events.onError.add(function(err, options)) {
  // something horrible happened
}
```

`addPage` is not currently supported for `onError`. This will probably change.

Regardless of the `reloadOnError` setting, you can request specific behavior
from this event handler by calling `err.preventReload()` or `err.requestReload()`.
All event handlers will be run before the page is reloaded, so later event handlers
may override the selected behavior.