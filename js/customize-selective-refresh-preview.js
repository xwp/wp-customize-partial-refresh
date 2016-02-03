/* global jQuery, JSON, _customizeSelectiveRefreshExports, _wpmejsSettings */
/* exported customizeSelectiveRefreshPreview */
var customizeSelectiveRefreshPreview = ( function( $, api ) {
	'use strict';

	var self = {
		ready: $.Deferred(),
		data: {
			partials: {},
			renderQueryVar: '',
			l10n: {},
			refreshBuffer: 25 // @todo Increase to 250
		},
		currentRequest: null
	};

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
	 */
	self.Partial = api.Class.extend({

		id: null,

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

			$.extend( partial.params, _.defaults(
				options.params || {},
				partial.defaults
			) );

			partial.deferred = {};
			partial.deferred.ready = $.Deferred();

			partial.deferred.ready.done( function() {
				partial.ready();
			} );

			// @todo Add templateSelector? Add container? No, these can be added by subclasses and used optionally.
		},

		/**
		 * Set up the partial.
		 */
		ready: function() {
			var partial = this;
			_.each( _.pluck( partial.containers(), 'element' ), function( element ) {
				element.attr( 'title', self.data.l10n.shiftClickToEdit );
			} );
			$( document ).on( 'click', partial.params.selector, function( e ) {
				if ( ! e.shiftKey ) {
					return;
				}
				e.preventDefault();
				partial.showControl();
			} );
		},

		/**
		 * Find all elements by the selector and return along with any context data supplied on the container.
		 *
		 * @todo Rename this to instances()?
		 *
		 * @return {Array.<Object>}
		 */
		containers: function() {
			var partial = this;
			return $( partial.params.selector ).map( function() {
				var container = $( this );
				return {
					element: container,
					context: container.data( 'customize-container-context' )
				};
			} );
		},

		/**
		 * Get list of setting IDs related to this partial.
		 *
		 * @return {String[]}
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
		 * Return whether the setting is related to the partial.
		 *
		 * @param {wp.customize.Value|string} setting  ID or object for setting.
		 * @return {boolean} Whether the setting is related to the partial.
		 */
		isRelatedSetting: function( setting ) {
			var partial = this;
			if ( _.isString( setting ) ) {
				setting = api( setting );
			}
			if ( ! setting ) {
				return false;
			}
			return -1 !== _.indexOf( partial.settings(), setting.id );
		},

		/**
		 * Show the control to modify this partial's setting(s).
		 *
		 * This may be overridden for inline editing.
		 */
		showControl: function() {
			var partial = this, settingId = partial.params.primarySetting;
			if ( ! settingId ) {
				settingId = _.first( partial.settings() );
			}
			api.preview.send( 'focus-control-for-setting', settingId );
		},

		/**
		 * Prepare container for selective refresh.
		 */
		prepareContainer: function( container ) {
			container.element.addClass( 'customize-partial-refreshing' );
		},

		/**
		 * @private
		 */
		_pendingUpdatePromise: null,

		/**
		 * Request the new partial and render it into the containers.
		 *
		 * @return {jQuery.Promise}
		 *
		 * @todo Break this up into a request() and render() methods
		 * @todo Batch requests. This is not a concern for caching because Customizer preview responses aren't cached anyway.
		 * @todo Debounce and return promise.
		 */
		refresh: function() {
			var partial = this;

			// @todo The containers may contain additional contextual information that need to be passed along in the request
			// @todo partial.requestDeferreds

			if ( partial._pendingUpdatePromise ) {
				return partial._pendingUpdatePromise;
			}

			_.each( partial.containers(), function( container ) {
				partial.prepareContainer( container );
			} );

			partial._pendingUpdatePromise = self.requestPartial( partial );

			partial._pendingUpdatePromise.done( function( containers ) {
				_.each( containers, function( container ) {
					partial.renderContent( container );
				} );
			} );
			partial._pendingUpdatePromise.fail( function( data, containers ) {
				partial.fallback( data, containers );
			} );

			// Allow new request when this one finishes.
			partial._pendingUpdatePromise.always( function() {
				partial._pendingUpdatePromise = null;
			} );

			return partial._pendingUpdatePromise;
		},

		/**
		 * Prepare containers for selective refresh.
		 *
		 * @todo Change args to be positional for closer parity with render filters? $rendered, $partial, $container_context
		 *
		 * @param {object} container
		 * @param {jQuery} [container.element] - This param will be empty if there was no element matching the selector.
		 * @param {string} container.content   - Rendered HTML content.
		 * @param {object} [container.context] - Optional context information about the container.
		 */
		renderContent: function( container ) {
			var partial = this, content;
			if ( ! container.element ) {
				partial.fallback( new Error( 'no_element' ), [ container ] );
				return;
			}
			content = container.content;

			// @todo Jetpack infinite scroll needs to use the same mechanism to set up content.
			// @todo Initialize the MediaElement.js player for any posts not previously initialized
			// @todo Will Jetpack do this for us as well?
			if ( wp && wp.emoji && wp.emoji.parse ) {
				content = wp.emoji.parse( content );
			}

			container.element.html( content );

			partial.setupMediaElements( container.element, content );

			container.element.removeClass( 'customize-partial-refreshing' );
		},

		/**
		 * Adapted from Scroller.prototype.initializeMejs in Jetpack Infinite Scroll module
		 *
		 * @link https://github.com/Automattic/jetpack/blob/master/modules/infinite-scroll/infinity.js#L372-L426
		 * @todo This needs to lazy-load ME.js
		 *
		 * @param container
		 * @param partialHtml
		 */
		setupMediaElements: function( container, partialHtml ) {
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
		},

		/**
		 * Handle fail to render partial.
		 *
		 * The first argument is either the failing jqXHR or an Error object, and the second argument is the array of containers.
		 */
		fallback: function() {
			var partial = this;
			partial.requestFullRefresh();
		},

		/**
		 * Request full page refresh.
		 *
		 * When selective refresh is embedded in the context of frontend editing, this request
		 * must fail or else changes will be lost, unless transactions are implemented.
		 */
		requestFullRefresh: function() {
			api.preview.send( 'refresh' );
		}

	} );

	/**
	 * Mapping of type names to Partial constructor subclasses.
	 *
	 * @type {Object.<string, self.Partial>}
	 */
	self.partialConstructor = {};

	self.partial = new api.Values({ defaultConstructor: self.Partial });


	self.NavMenuPartial = self.Partial.extend({

	});

	self.partialConstructor.nav_menu = self.NavMenuPartial;

	/**
	 * Get the POST vars for a Customizer preview request.
	 *
	 * @see wp.customize.previewer.query()
	 * @return {object}
	 */
	self.getCustomizeQuery = function() {
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
	};

	/**
	 * Currently-requested partials and their associated deferreds.
	 *
	 * @type {Object}
	 */
	self._pendingPartialRequests = {};

	/**
	 * Timeout ID for the current requesr, or null if no request is current.
	 *
	 * @type {number|null}
	 * @private
	 */
	self._debouncedTimeoutId = null;

	/**
	 * Current jqXHR for the request to the partials.
	 *
	 * @type {jQuery.jqXHR|null}
	 * @private
	 */
	self._currentPartialsRequest = null;

	/**
	 *
	 * @param {self.Partial} partial
	 * @return {jQuery.Promise}
	 */
	self.requestPartial = function( partial ) {
		var partialRequest;

		if ( self._debouncedTimeoutId ) {
			clearTimeout( self._debouncedTimeoutId );
			self._debouncedTimeoutId = null;
		}
		if ( self._currentPartialsRequest ) {
			self._currentPartialsRequest.abort();
			self._currentPartialsRequest = null;
		}

		partialRequest = self._pendingPartialRequests[ partial.id ];
		if ( partialRequest ) {
			return partialRequest.deferred.promise();
		}

		partialRequest = {
			deferred: $.Deferred(),
			partial: partial
		};
		self._pendingPartialRequests[ partial.id ] = partialRequest;

		self._debouncedTimeoutId = setTimeout(
			function() {
				var data, partialContainerContexts, partialsContainers, request;

				self._debouncedTimeoutId = null;
				data = self.getCustomizeQuery();

				/*
				 * It is key that the containers be fetched exactly at the point of the request being
				 * made, because the containers need to be mapped to responses by array indices.
				 */
				partialsContainers = {};

				partialContainerContexts = {};
				_.each( self._pendingPartialRequests, function( pending, partialId ) {
					partialsContainers[ partialId ] = pending.partial.containers();
					if ( ! self.partial.has( partialId ) ) {
						pending.deferred.rejectWith( pending.partial, [ new Error( 'partial_removed' ), partialsContainers[ partialId ] ] );
					} else {
						/*
						 * Note that this may in fact be an empty array. In that case, it is the responsibility
						 * of the Partial subclass instance to know where to inject the response, or else to
						 * just issue a refresh (default behavior). The data being returned with each container
						 * is the context information that may be needed to render certain partials, such as
						 * the contained sidebar for rendering widgets or what the nav menu args are for a menu.
						 */
						partialContainerContexts[ partialId ] = _.map( partialsContainers[ partialId ], function( container ) {
							return container.context || {};
						} );
					}
				} );

				data.partials = JSON.stringify( partialContainerContexts );
				data[ self.data.renderQueryVar ] = '1';

				request = self._pendingPartialsRequests = wp.ajax.send( null, {
					data: data,
					url: api.settings.url.self
				} );

				request.done( function( data ) {

					/*
					 * Note that data is an array of items that correspond to the array of
					 * containers that were submitted in the request. So we zip up the
					 * array of containers with the array of contents for those containers,
					 * and send them into .
					 */
					_.each( self._pendingPartialRequests, function( pending, partialId ) {
						var containersContents = _.map( data.contents[ partialId ], function( content, i ) {
							return _.extend(
								partialsContainers[ partialId ][ i ] || {}, // Note that {} means no containers were selected, partial.fallback() likely to be called.
								{ content: content }
							);
						} );
						pending.deferred.resolveWith( pending.partial, [ containersContents ] );
					} );
				} );

				request.fail( function( data, statusText ) {

					/*
					 * Ignore failures caused by partial.currentRequest.abort()
					 * The pending deferreds will remain in self._pendingPartialRequests
					 * for re-use with the next request.
					 */
					if ( 'abort' === statusText ) {
						return;
					}

					_.each( self._pendingPartialRequests, function( pending, partialId ) {
						pending.deferred.rejectWith( pending.partial, [ data, partialsContainers[ partialId ] ] );
					} );
				} );

				request.always( function() {
					delete self._pendingPartialRequests[ partial.id ];
				} );
			},
			self.data.refreshBuffer
		);

		return partialRequest.deferred.promise();
	};

	api.bind( 'preview-ready', function() {

		_.extend( self.data, _customizeSelectiveRefreshExports );

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
				if ( partial.isRelatedSetting( setting ) ) {
					partial.refresh();
				}
			} );
		} );

		api.preview.bind( 'active', function() {

			// Make all partials ready.
			self.partial.each( function( partial ) {
				partial.deferred.ready.resolve();
			} );

			// Make all partials added henceforth as ready upon add.
			self.partial.bind( 'add', function( partial ) {
				partial.deferred.ready.resolve();
			} );
		} );

	} );

	return self;
}( jQuery, wp.customize ) );
