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

			// @todo Add templateSelector? Add container? No, these can be added by subclasses and used optionally.
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
		 * Get list of setting IDs related to this partial.
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
			partial.findContainers().each( function() {
				partial.prepareSelectiveRefreshContainer( $( this ) );
			} );

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
				var partialResponse = data[ partial.id ], error;
				if ( ! _.isObject( partialResponse ) || _.isUndefined( partialResponse.data ) ) {
					error = 'fail';
				} else if ( partialResponse.error ) {
					error = partialResponse.error;
				}

				if ( error ) {
					partial.handleRenderFail( error );
				} else {
					partial.handleRenderSuccess( partialResponse.data );
				}
			} );
			partial.currentRequest.fail( function( jqXHR, textStatus, errorThrown ) {

				// Ignore failures caused by partial.currentRequest.abort()
				if ( 'abort' === textStatus ) {
					return;
				}
				partial.handleRenderFail( errorThrown ? errorThrown.message : textStatus );
			} );
		}, self.data.refreshBuffer ),

		/**
		 * Request full page refresh.
		 *
		 * @todo When selective refresh is embedded in the context of frontend editing, this request must fail or else changes will be lost, unless transactions are implemented.
		 */
		requestFullRefresh: function() {
			api.preview.send( 'refresh' );
		},

		/**
		 * Handle successful response to
		 *
		 * @param {string} rendered
		 */
		handleRenderSuccess: function( rendered ) {
			var partial = this;
			rendered = rendered || '';

			// @todo Trigger event which allows custom rendering to be aborted, to force a refresh? Or rather just implement subclassed Partial classes?

			if ( ! partial.canSelectiveRefresh( rendered ) ) {
				partial.requestFullRefresh();
				return;
			}

			partial.findContainers().each( function() {
				if ( false === partial.selectiveRefresh( $( this ), rendered ) ) {
					partial.requestFullRefresh();
				}
			} );

			// @todo Subclass can invoke custom functionality to handle the rendering of the response here
		},

		prepareSelectiveRefreshContainer: function( container ) {
			container.addClass( 'customize-partial-refreshing' );
		},

		/**
		 * Inject the rendered partial into the selected container.
		 *
		 * @param {jQuery} container
		 * @param {string} rendered
		 * @return {boolean} Whether the selective refresh was successful. If false, then a full refresh will be requested.
		 */
		selectiveRefresh: function( container, rendered ) {
			var partial = this;

			// @todo Jetpack infinite scroll needs to use the same mechanism to set up content.
			// @todo Initialize the MediaElement.js player for any posts not previously initialized
			// @todo Will Jetpack do this for us as well?
			if ( wp && wp.emoji && wp.emoji.parse ) {
				rendered = wp.emoji.parse( rendered );
			}
			container.html( rendered );
			partial.renderMediaElements( container );
			container.removeClass( 'customize-partial-refreshing' );

			return true;
		},

		/**
		 * Handle fail to render partial.
		 *
		 * @param {string} error
		 */
		handleRenderFail: function() {
			var partial = this;
			partial.requestFullRefresh();
		},

		/**
		 * Return whether the partial render response can be selectively refreshed.
		 *
		 * @param {string} rendered
		 * @returns {boolean}
		 */
		canSelectiveRefresh: function() {
			return true;
		},

		// @todo ? shouldFullRefresh: function( response ) {},

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

	self.partialConstructor = {};

	self.partial = new api.Values({ defaultConstructor: self.Partial });

	api.bind( 'preview-ready', function() {

		// Create the partial JS models.
		_.each( self.data.partials, function( data, id ) {
			var Constructor, partial = self.partial( id );
			if ( ! partial ) {
				Constructor = self.partialConstructor[ data.type ] || self.Partial;
				partial = new Constructor( id, { params: data } );
				self.partial.add( id, partial );
			} else {
				_.extend( partial.params, data );
			}
		} );

		// Trigger update for each partial that is associated with a changed setting.
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
