/* global jQuery, JSON, _customizeSelectiveRefreshExports */
wp.customize.selectiveRefresh = ( function( $, api ) {
	'use strict';

	var self = {
		ready: $.Deferred(),
		data: {
			partials: {},
			renderQueryVar: '',
			l10n: {
				shiftClickToEdit: ''
			},
			refreshBuffer: 250
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
	 * @param {bool}   options.params.fallbackRefresh  Whether to refresh the entire preview in case of a partial refresh failure.
	 */
	api.Partial = api.Class.extend({

		id: null,

		 /**
		 * Constructor.
		 *
		 * @since 4.5.0
		 * @param {string} id      - Partial ID.
		 * @param {Object} options
		 * @param {Object} options.params
		 */
		initialize: function( id, options ) {
			var partial = this;
			options = options || {};
			partial.id = id;

			partial.params = _.extend(
				{
					selector: '',
					settings: [],
					primarySetting: null,
					fallbackRefresh: true // Note this needs to be false in a frontend editing context.
				},
				options.params || {}
			);

			partial.deferred = {};
			partial.deferred.ready = $.Deferred();

			partial.deferred.ready.done( function() {
				partial.ready();
			} );
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
				_.each( partial.containers(), function( container ) {
					if ( container.element.is( e.currentTarget ) ) {
						partial.showControl();
					}
				} );
			} );
		},

		/**
		 * Find all elements by the selector and return along with any context data supplied on the container.
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
			} ).get();
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
		 * Reference to the pending promise returned from self.requestPartial().
		 *
		 * @private
		 */
		_pendingRefreshPromise: null,

		/**
		 * Request the new partial and render it into the containers.
		 *
		 * @this {wp.customize.Partial}
		 * @return {jQuery.Promise}
		 */
		refresh: function() {
			var partial = this, refreshPromise;

			refreshPromise = self.requestPartial( partial );

			if ( ! partial._pendingRefreshPromise ) {
				_.each( partial.containers(), function( container ) {
					partial.prepareContainer( container );
				} );

				refreshPromise.done( function( containers ) {
					_.each( containers, function( container ) {
						partial.renderContent( _.extend( {}, container ) );
					} );
				} );

				refreshPromise.fail( function( data, containers ) {
					partial.fallback( data, containers );
				} );

				// Allow new request when this one finishes.
				partial._pendingRefreshPromise = refreshPromise;
				refreshPromise.always( function() {
					partial._pendingRefreshPromise = null;
				} );
			}

			return refreshPromise;
		},

		/**
		 * Prepare containers for selective refresh.
		 *
		 * @todo Change args to be positional for closer parity with render filters? $rendered, $partial, $container_context
		 *
		 * @param {object}         container
		 * @param {jQuery}         [container.element] - This param will be empty if there was no element matching the selector.
		 * @param {string|boolean} container.content   - Rendered HTML content, or false if no render.
		 * @param {object}         [container.context] - Optional context information about the container.
		 * @returns {boolean} Whether the rendering was successful and the fallback was not invoked.
		 */
		renderContent: function( container ) {
			var partial = this, content;
			if ( ! container.element ) {
				partial.fallback( new Error( 'no_element' ), [ container ] );
				return false;
			}
			if ( false === container.content ) {
				partial.fallback( new Error( 'missing_render' ), [ container ] );
				return false;
			}
			content = container.content;

			// @todo See multi-line comment below for how this logic should be tied to a new standard event that fires when
			if ( wp && wp.emoji && wp.emoji.parse ) {
				content = wp.emoji.parse( content );
			}

			// @todo Detect if content also includes the container wrapper, and if so, only inject the content children?
			container.element.html( content );

			container.element.removeClass( 'customize-partial-refreshing' );

			/*
			 * Trigger an event so that dynamic elements can be re-built.
			 *
			 * @todo This should be standardized for use in WordPress generally, to be used instead of the post-load event used in Jetpack's Infinite Scrolling or the o2 plugin.
			 *
			 * Core can add an event handler to automatically run wp-emoji.parse() on this event instead of copying the code above.
			 * Core can add another event handler for initializing MediaElement.js elements. See https://github.com/Automattic/jetpack/blob/master/modules/infinite-scroll/infinity.js#L372-L426
			 *
			 * The post-load event below is re-using what Jetpack introduces, with the introduction of the target property.
			 * It is not ideal because it is not just posts that are selectively refreshed, but any element.
			 */
			$( document.body ).trigger( 'post-load', { html: content, target: container.element } );
			return true;
		},

		/**
		 * Handle fail to render partial.
		 *
		 * The first argument is either the failing jqXHR or an Error object, and the second argument is the array of containers.
		 */
		fallback: function() {
			var partial = this;
			if ( partial.params.fallbackRefresh ) {
				self.requestFullRefresh();
			}
		}

	} );

	/**
	 * Mapping of type names to Partial constructor subclasses.
	 *
	 * @type {Object.<string, wp.customize.Partial>}
	 */
	api.partialConstructor = {};

	api.partial = new api.Values({ defaultConstructor: api.Partial });

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
	 * @type {Object<string, { deferred: jQuery.Promise, partial: wp.customize.Partial }>}
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
	self._currentRequest = null;

	/**
	 * Request full page refresh.
	 *
	 * When selective refresh is embedded in the context of frontend editing, this request
	 * must fail or else changes will be lost, unless transactions are implemented.
	 */
	self.requestFullRefresh = function() {
		api.preview.send( 'refresh' );
	};

	/**
	 *
	 * @param {wp.customize.Partial} partial
	 * @return {jQuery.Promise}
	 */
	self.requestPartial = function( partial ) {
		var partialRequest;

		if ( self._debouncedTimeoutId ) {
			clearTimeout( self._debouncedTimeoutId );
			self._debouncedTimeoutId = null;
		}
		if ( self._currentRequest ) {
			self._currentRequest.abort();
			self._currentRequest = null;
		}

		partialRequest = self._pendingPartialRequests[ partial.id ];
		if ( ! partialRequest || 'pending' !== partialRequest.deferred.state() ) {
			partialRequest = {
				deferred: $.Deferred(),
				partial: partial
			};
			self._pendingPartialRequests[ partial.id ] = partialRequest;
		}

		// Prevent leaking partial into debounced timeout callback.
		partial = null;

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
					if ( ! api.partial.has( partialId ) ) {
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

				request = self._currentRequest = wp.ajax.send( null, {
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
						var containersContents;
						if ( ! _.isArray( data.contents[ partialId ] ) ) {
							pending.deferred.rejectWith( pending.partial, [ new Error( 'unrecognized_partial' ), partialsContainers[ partialId ] ] );
						} else {
							containersContents = _.map( data.contents[ partialId ], function( content, i ) {
								return _.extend(
									partialsContainers[ partialId ][ i ] || {}, // Note that {} means no containers were selected, partial.fallback() likely to be called.
									{ content: content }
								);
							} );
							pending.deferred.resolveWith( pending.partial, [ containersContents ] );
						}
					} );
					self._pendingPartialRequests = {};
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
					self._pendingPartialRequests = {};
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
			var Constructor, partial = api.partial( id );
			if ( ! partial ) {
				Constructor = api.partialConstructor[ data.type ] || api.Partial;
				partial = new Constructor( id, { params: data } );
				api.partial.add( id, partial );
			} else {
				_.extend( partial.params, data );
			}
		} );

		// Trigger update for each partial that is associated with a changed setting.
		api.bind( 'change', function( setting ) {
			api.partial.each( function( partial ) {
				if ( partial.isRelatedSetting( setting ) ) {
					partial.refresh();
				}
			} );
		} );

		api.preview.bind( 'active', function() {

			// Make all partials ready.
			api.partial.each( function( partial ) {
				partial.deferred.ready.resolve();
			} );

			// Make all partials added henceforth as ready upon add.
			api.partial.bind( 'add', function( partial ) {
				partial.deferred.ready.resolve();
			} );
		} );

	} );

	return self;
}( jQuery, wp.customize ) );
