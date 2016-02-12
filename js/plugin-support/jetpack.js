/* global twttr, google, infiniteScroll, FB, _customizeSelectiveRefreshJetpackExports */
/* exported customizeSelectiveRefreshJetpackModuleSupport */

/**
 * Integrate Customize Partial Refresh with Jetpack.
 *
 * @param {object}  api - wp.customize
 * @param {object}  $
 * @param {object}  exports
 * @param {object}  exports.infiniteScroll
 * @param {object}  exports.infiniteScroll.themeSupport
 * @param {object}  exports.widgets
 */
var customizeSelectiveRefreshJetpackModuleSupport = (function( api, $, exports ) {
	var moduleSupport = {}, self = {}, loadingScripts = {};

	/**
	 * Load script.
	 *
	 * @param {object} args
	 * @param {string} args.handle
	 * @param {string} args.src
	 * @param {Function} args.test - If function returns true, then script loading is short-circuited.
	 * @returns {Promise}
	 */
	self.loadScript = function( args ) {
		var loadingScript;
		if ( ! args.handle ) {
			args.handle = args.src;
		}
		if ( args.test && args.test() ) {
			return $.Deferred().resolve().promise();
		}
		loadingScript = loadingScripts[ args.handle ];
		if ( loadingScript ) {
			return loadingScript.deferred.promise();
		}
		loadingScript = loadingScripts[ args.handle ] = {
			src: args.src,
			element: document.createElement( 'script' ),
			deferred: $.Deferred()
		};
		loadingScript.element.id = args.handle;
		loadingScript.element.src = args.src;
		loadingScript.element.onload = function() {
			loadingScript.deferred.resolve();
		};
		loadingScript.element.onerror = function() {
			loadingScript.deferred.reject();
		};
		document.body.insertBefore( loadingScript.element, null );
		return loadingScript.deferred.promise();
	};

	moduleSupport.widgets = function( config ) {

		var module = {
			widgetRenderHandlers: {}
		};

		/**
		 * Get the widget ID base for a given partial.
		 *
		 * @param {wp.customize.Partial} partial
		 * @param {string}               partial.widgetId
		 * @returns {string|null}
		 */
		module.getWidgetPartialIdBase = function( partial ) {
			var matches;
			if ( ! partial.widgetId || ! partial.extended( api.widgetsPreview.WidgetInstancePartial ) ) {
				return null;
			}
			matches = partial.widgetId.match( /^(.+?)(-\d+)?$/ );
			if ( ! matches ) {
				return null;
			}
			return matches[1];
		};

		/**
		 * Handle rendering of Twitter Timeline widget
		 *
		 * @param args
		 */
		module.widgetRenderHandlers.twitter_timeline = function( args ) {
			var hasWidgetIdSupplied = false, dependency;

			args.newContainer.find( '.twitter-timeline[data-widget-id]' ).each( function() {
				if ( $( this ).data( 'widgetId' ) ) {
					hasWidgetIdSupplied = true;
				}
			} );
			if ( ! hasWidgetIdSupplied ) {
				return;
			}
			dependency = {
				handle: 'twitter-wjs',
				src: '//platform.twitter.com/widgets.js',
				test: function() {
					return 'undefined' !== typeof twttr && twttr.widgets && twttr.widgets.load;
				}
			};
			self.loadScript( dependency ).done(function() {
				twttr.widgets.load( args.newContainer[0] );
			});
		};

		/**
		 * Handle rendering of Contact Info widget.
		 *
		 * @param {object} args
		 */
		module.widgetRenderHandlers.widget_contact_info = function( args ) {
			if ( ! args.newContainer.find( '.contact-map' ).length ) {
				return;
			}
			if ( $( 'link#contact-info-map-css-css' ).length < 1 ) {
				$( 'head:first' ).append( $( '<link>', {
					id: 'contact-info-map-css-css', // The doubled 'css' is intentional.
					rel: 'stylesheet',
					href: config.styles['contact-info-map-css'].src,
					type: 'text/css'
				} ) );
			}

			self.loadScript({
				handle: 'google-maps',
				src: config.scripts['google-maps'].src,
				test: function() {
					return 'undefined' !== typeof google && 'undefined' !== typeof google.maps;
				}
			}).done( function() {

				// The logic in this script has to be loaded anew each time.
				$.getScript( config.scripts['contact-info-map-js'].src );
			} );
		};

		/**
		 * Handle rendering of Facebook Page widget.
		 *
		 * @param {object} args
		 */
		module.widgetRenderHandlers['facebook-likebox'] = function( args ) {
			if ( 'undefined' !== typeof FB ) {

				// @todo This is not reliably rebuilding the Like box, especially after the widget is dragged to a new position and a change is made.
				FB.XFBML.parse( args.newContainer[0] );
			}
		};

		/**
		 * Handle rendering of partials.
		 *
		 * @param {object}               args
		 * @param {wp.customize.Partial} args.partial
		 * @param {string|object|null}   args.content - Will be null in the case of a nested partial being re-rendered.
		 * @param {object}               args.context
		 * @param {jQuery}               args.newContainer
		 * @param {jQuery|null}          args.oldContainer - Will be null in case of nested partial being re-rendered.
		 */
		api.bind( 'partial-content-rendered', function( args ) {
			var idBase = module.getWidgetPartialIdBase( args.partial );
			if ( idBase && module.widgetRenderHandlers[ idBase ] ) {
				module.widgetRenderHandlers[ idBase ]( args );
			}
		} );

		/**
		 * Handle moving of partials (normally widgets).
		 *
		 * @param {object}               args
		 * @param {wp.customize.Partial} args.partial
		 * @param {object}               args.context
		 * @param {jQuery}               args.container
		 */
		api.bind( 'partial-content-moved', function( args ) {

			// Refresh a partial containing a Twitter timeline iframe, since it has to be re-built.
			if ( args.container.find( 'iframe.twitter-timeline:not([src]):first' ).length ) {
				args.partial.refresh();
			}
		} );
	};

	/**
	 * Handle infinite scroll compatibility.
	 *
	 * @param {object} config
	 * @param {boolean} config.themeSupport
	 */
	moduleSupport.infiniteScroll = function( config ) {

		if ( ! config.themeSupport || 'undefined' === typeof infiniteScroll ) {
			return;
		}

		/**
		 * Handle rendering of partials.
		 *
		 * @param {object}               args
		 * @param {wp.customize.Partial} args.partial
		 * @param {string|object|null}   args.content - Will be null in the case of a nested partial being re-rendered.
		 * @param {object}               args.context
		 * @param {jQuery}               args.newContainer
		 * @param {jQuery|null}          args.oldContainer - Will be null in case of nested partial being re-rendered.
		 */
		api.bind( 'partial-content-rendered', function( args ) {

			// Trigger Jetpack Infinite Scroll's post-load event so ME.js and other dynamic elements can be rebuilt.
			$( document.body ).trigger( 'post-load', { html: _.isString( args.content ) ? args.content : args.newContainer.html() } );
		} );

		// Add partials when new posts are added for infinite scroll.
		$( document.body ).on( 'post-load', function( e, response ) {
			var rootElement = null;
			if ( response.html && -1 !== response.html.indexOf( 'data-customize-partial' ) ) {
				if ( infiniteScroll.settings.id ) {
					rootElement = $( '#' + infiniteScroll.settings.id );
				}
				api.selectiveRefreshPreview.addPartials( rootElement );
			}
		} );
	};

	_.each( exports, function( config, moduleName ) {
		if ( moduleSupport[ moduleName ] ) {
			moduleSupport[ moduleName ]( config );
		}
	} );

	return moduleSupport;
}(
	wp.customize,
	jQuery,
	'undefined' !== typeof _customizeSelectiveRefreshJetpackExports ? _customizeSelectiveRefreshJetpackExports : null
) );
