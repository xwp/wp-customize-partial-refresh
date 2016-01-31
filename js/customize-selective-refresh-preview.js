/* global jQuery, JSON, _customizeSelectiveRefreshExports, _wpmejsSettings */
/* exported customizeSelectiveRefreshPreview */
var customizeSelectiveRefreshPreview = ( function( $, api ) {
	'use strict';

	var self = {
		ready: $.Deferred(),
		data: {
			partials: {},
			renderQueryVar: '',
			requestUri: '',
			refreshBuffer: 25 // @todo Increase to 250
		},
		currentRequest: null
	};

	_.extend( self.data, _customizeSelectiveRefreshExports );

	/**
	 * A Customizer Partial.
	 *
	 * A partial provides a rendering of one or more settings according to a template.
	 *
	 * @see PHP class WP_Customize_Partial.
	 *
	 * @class
	 * @augments wp.customize.Class
	 *
	 * @param {string} id                              Unique identifier for the control instance.
	 * @param {object} options                         Options hash for the control instance.
	 * @param {object} options.params
	 * @param {string} options.params.type             Type of partial (e.g. nav_menu, widget, etc)
	 * @param {string} options.params.selector         jQuery selector to find the container element in the page.
	 * @param {array}  options.params.settings         The IDs for the settings the partial relates to.
	 * @param {string} options.params.primarySetting   The ID for the primary setting the partial renders.
	 *
	 * @todo @param {string} options.params.template?          The underscore template to render?
	 */
	self.Partial = api.Class.extend({

		defaults: {
			type: 'default',
			selector: '',
			settings: [],
			primarySetting: null
		},

		initialize: function( id, options ) {
			var partial = this;
			options = options || {};
			partial.id = id;
			partial.params = {};
			partial.requestDeferreds = [];

			$.extend( partial.params, _.defaults(
				options.params || {},
				partial.defaults
			) );

			// @todo Add templateSelector? Add container?
		},

		/**
		 * Find all elements by the selector.
		 *
		 * @return {jQuery}
		 */
		findContainers: function() {
			var partial = this;
			return $( partial.params.selector );
		},

		/**
		 * Get list of setting IDs.
		 *
		 * @returns {Array}
		 */
		settings: function() {
			var partial = this;
			if ( partial.params.settings && 0 !== partial.params.settings.length ) {
				return partial.params.settings;
			} else if ( partial.params.primarySetting ) {
				return [ partial.params.primarySetting ];
			} else {
				return [ partial.id ];
			}
		},

		/**
		 * Get the POST vars for a Customizer preview request.
		 *
		 * @see wp.customize.previewer.query()
		 * @return {object}
		 */
		getCustomizeQuery: function() {
			var dirtyCustomized = {};
			api.each( function( value, key ) {
				if ( value._dirty ) {
					dirtyCustomized[ key ] = value();
				}
			} );

			return {
				wp_customize: 'on',
				nonce: api.settings.nonce.preview,
				theme: api.settings.theme.stylesheet,
				customized: JSON.stringify( dirtyCustomized )
			};
		},

		/**
		 * Request the new partial and render it into the containers.
		 *
		 * @todo Break this up into a request() and render() methods
		 * @todo Batch requests. This is not a concern for caching because Customizer preview responses aren't cached anyway.
		 * @todo Debounce and return promise.
		 */
		update: _.debounce( function() {
			var partial = this, data;

			// @todo partial.requestDeferreds

			if ( partial.currentRequest ) {
				partial.currentRequest.abort();
				partial.currentRequest = null;
			}

			// @todo The debounce here is a fail because this class needs to be added immediately, followed by the debounced Ajax request.
			partial.findContainers().addClass( 'customize-partial-refreshing' );

			data = $.extend(
				partial.getCustomizeQuery(),
				{
					partial_id: [ partial.id ]
				}
			);
			data[ self.data.renderQueryVar ] = '1';

			partial.currentRequest = wp.ajax.send( null, {
				data: data,
				url: api.settings.url.self
			} );

			partial.currentRequest.done( function( data ) {
				var partialData = data[ partial.id ];
				if ( ! partialData || partialData.error ) {
					api.preview.send( 'refresh' );
					return;
				}

				partial.findContainers().each( function() {
					var container = $( this ), rendered;
					rendered = partialData.data;

					// @todo Jetpack infinite scroll needs to use the same mechanism to set up content.
					// @todo Initialize the MediaElement.js player for any posts not previously initialized
					// @todo Will Jetpack do this for us as well?
					if ( wp && wp.emoji && wp.emoji.parse ) {
						rendered = wp.emoji.parse( rendered );
					}
					container.html( rendered );

					partial.renderMediaElements( container );

					container.removeClass( 'customize-partial-refreshing' );
				} );
			} );
			partial.currentRequest.fail( function( jqXHR, textStatus ) {
				if ( 'abort' !== textStatus ) {
					api.preview.send( 'refresh' );
				}
			} );
		}, self.data.refreshBuffer ),

		/**
		 * Adapted from Scroller.prototype.initializeMejs in Jetpack Infinite Scroll module
		 *
		 * @link https://github.com/Automattic/jetpack/blob/master/modules/infinite-scroll/infinity.js#L372-L426
		 * @todo This needs to lazy-load ME.js
		 *
		 * @param container
		 * @param partialHtml
		 */
		renderMediaElements: function( container, partialHtml ) {
			var settings = {};

			// Are there media players in the incoming set of posts?
			if ( ! partialHtml || -1 === partialHtml.indexOf( 'wp-audio-shortcode' ) && -1 === partialHtml.indexOf( 'wp-video-shortcode' ) ) {
				return;
			}

			// Don't bother if mejs isn't loaded for some reason
			if ( 'undefined' === typeof mejs ) {
				return;
			}

			// Adapted from wp-includes/js/mediaelement/wp-mediaelement.js
			// Modified to not initialize already-initialized players, as Mejs doesn't handle that well

			if ( 'undefined' !== typeof _wpmejsSettings ) {
				settings.pluginPath = _wpmejsSettings.pluginPath;
			}

			settings.success = function( mejs ) {
				var autoplay = mejs.attributes.autoplay && 'false' !== mejs.attributes.autoplay;
				if ( 'flash' === mejs.pluginType && autoplay ) {
					mejs.addEventListener( 'canplay', function() {
						mejs.play();
					}, false );
				}
			};

			container.find( '.wp-audio-shortcode, .wp-video-shortcode' ).not( '.mejs-container' ).mediaelementplayer( settings );
		}

	} );

	self.partial = new api.Values({ defaultConstructor: self.Partial });

	api.bind( 'preview-ready', function() {

		// Create the partial JS models.
		_.each( self.data.partials, function( data, id ) {
			var partial = self.partial( id );
			if ( ! partial ) {
				self.partial.create( id, id, { params: data } );
			} else {
				_.extend( partial.params, data );
			}
		} );

		api.bind( 'change', function( setting ) {
			self.partial.each( function( partial ) {
				if ( -1 !== _.indexOf( partial.settings(), setting.id ) ) {
					partial.update();
				}
			} );
		} );

		self.ready.resolve();
	} );

	return self;
}( jQuery, wp.customize ) );
