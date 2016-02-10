/* global _wpWidgetCustomizerPreviewSettings */
wp.customize.widgetsPreview = wp.customize.WidgetCustomizerPreview = (function( $, _, wp, api ) {

	var self;

	self = {
		renderedSidebars: {},
		renderedWidgets: {},
		registeredSidebars: [],
		registeredWidgets: {},
		widgetSelectors: [],
		preview: null,
		l10n: {
			widgetTooltip: ''
		}
	};

	/**
	 * Init widgets preview.
	 *
	 * @since 4.5.0
	 */
	self.init = function() {
		var self = this;

		self.preview = api.preview;
		self.addPartials();

		self.buildWidgetSelectors();
		self.highlightControls();

		self.preview.bind( 'highlight-widget', self.highlightWidget );

		api.preview.bind( 'active', function() {
			self.highlightControls();
		} );
	};

	/**
	 * Partial representing a widget instance.
	 *
	 * @class
	 * @augments wp.customize.Partial
	 * @since 4.5.0
	 */
	self.WidgetInstancePartial = api.Partial.extend({

		/**
		 * Constructor.
		 *
		 * @since 4.5.0
		 * @param {string} id - Partial ID.
		 * @param {Object} options -
		 * @param {Object} options.params
		 */
		initialize: function( id, options ) {
			var partial = this, matches;
			matches = id.match( /^widget_instance\[(.+)]$/ );
			if ( ! matches ) {
				throw new Error( 'Illegal id for widget_instance partial.' );
			}

			partial.widgetId = matches[1];
			options = options || {};
			options.params = _.extend(
				{
					/* Note that a selector of ('#' + partial.widgetId) is faster, but jQuery will only return the one result. */
					selector: '[id="' + partial.widgetId + '"]', // Alternatively, '[data-customize-widget-id="' + partial.widgetId + '"]'
					settings: [ self.getWidgetInstanceSettingId( partial.widgetId ) ],
					containerInclusive: true
				},
				options.params || {}
			);

			api.Partial.prototype.initialize.call( partial, id, options );
		},

		/**
		 * Send widget-updated message to parent so spinner will get removed from widget control.
		 *
		 * @todo Fill page refresh should be called by default if the response contains script:not([type]), script[type='text/javascript']?
		 *
		 * @inheritdoc
		 * @param {object} container
		 */
		renderContent: function( container ) {
			var partial = this;
			if ( api.Partial.prototype.renderContent.call( partial, container ) ) {
				api.preview.send( 'widget-updated', partial.widgetId );
			}
		}
	});

	/**
	 * Partial representing a widget area.
	 *
	 * @class
	 * @augments wp.customize.Partial
	 * @since 4.5.0
	 */
	self.WidgetAreaPartial = api.Partial.extend({

		/**
		 * Constructor.
		 *
		 * @since 4.5.0
		 * @param {string} id - Partial ID.
		 * @param {Object} options
		 * @param {Object} options.params
		 */
		initialize: function( id, options ) {
			var partial = this, matches;
			matches = id.match( /^widget_area\[(.+)]$/ );
			if ( ! matches ) {
				throw new Error( 'Illegal id for widget_area partial.' );

			}
			partial.sidebarId = matches[1];

			options = options || {};
			options.params = _.extend(
				{
					settings: [ 'sidebars_widgets[' + partial.sidebarId + ']' ]
				},
				options.params || {}
			);

			api.Partial.prototype.initialize.call( partial, id, options );

			if ( ! partial.params.sidebarArgs ) {
				throw new Error( 'The sidebarArgs param was not provided.' );
			}

			partial.containerStartBoundaryNode = null;
			partial.containerEndBoundaryNode = null;
		},

		/**
		 * Set up the partial.
		 *
		 * @since 4.5.0
		 */
		ready: function() {
			var partial = this;
			_.each( partial.settings(), function( settingId ) {
				api( settingId, function( setting ) {
					setting.bind( _.bind( partial.handleSettingChange, partial ) );
				} );
			} );
		},

		/**
		 * Get the before/after boundary nodes for all instances of this sidebar (usually one).
		 *
		 * Note that TreeWalker is not implemented in IE8.
		 *
		 * @since 4.5.0
		 * @returns {Array.<{before: Comment, after: Comment, instanceNumber: number}>}
		 */
		findDynamicSidebarBoundaryNodes: function() {
			var partial = this, regExp, boundaryNodes = {}, recursiveCommentTraversal;
			regExp = /^(dynamic_sidebar_before|dynamic_sidebar_after):(.+):(\d+)$/;
			recursiveCommentTraversal = function( childNodes ) {
				_.each( childNodes, function( node ) {
					var matches;
					if ( 8 === node.nodeType ) {
						matches = node.nodeValue.match( regExp );
						if ( ! matches || matches[2] !== partial.sidebarId ) {
							return;
						}
						if ( _.isUndefined( boundaryNodes[ matches[3] ] ) ) {
							boundaryNodes[ matches[3] ] = {
								before: null,
								after: null,
								instanceNumber: parseInt( matches[3], 10 )
							};
						}
						if ( 'dynamic_sidebar_before' === matches[1] ) {
							boundaryNodes[ matches[3] ].before = node;
						} else {
							boundaryNodes[ matches[3] ].after = node;
						}
					} else if ( 1 === node.nodeType ) {
						recursiveCommentTraversal( node.childNodes );
					}
				} );
			};

			recursiveCommentTraversal( document.body.childNodes );
			return _.values( boundaryNodes );
		},

		/**
		 * Get the containers for this partial.
		 *
		 * @since 4.5.0
		 * @returns {Array}
		 */
		containers: function() {
			var partial = this;
			return _.map( partial.findDynamicSidebarBoundaryNodes(), function( boundaryNodes ) {
				return {
					element: null,
					beforeNode: boundaryNodes.before,
					afterNode: boundaryNodes.after,
					context: partial.params.sidebarArgs,
					instanceNumber: boundaryNodes.instanceNumber
				};
			} );
		},

		/**
		 * Make sure there is a widget instance container in this sidebar for the given widget ID.
		 *
		 * @since 4.5.0
		 *
		 * @param {string} widgetId
		 * @returns {wp.customize.Partial} Widget instance partial.
		 */
		ensureWidgetInstanceContainers: function( widgetId ) {
			var sidebarPartial = this, widgetPartial, partialId = 'widget_instance[' + widgetId + ']';
			widgetPartial = api.partial( partialId );
			if ( ! widgetPartial ) {
				widgetPartial = new self.WidgetInstancePartial( partialId, {
					params: {}
				} );
				api.partial.add( widgetPartial.id, widgetPartial );
			}

			// Make sure that there is a container element for the widget in the sidebar, if at least a placeholder.
			_.each( sidebarPartial.containers(), function( widgetAreaContainer ) {
				var widgetContainerElement;
				_.each( widgetPartial.containers(), function( widgetInstanceContainer ) {
					var elementNode, isBounded;
					if ( ! widgetInstanceContainer.element ) {
						return;
					}
					elementNode = widgetInstanceContainer.element[0];
					isBounded = (
						( widgetAreaContainer.beforeNode.compareDocumentPosition( elementNode ) & Node.DOCUMENT_POSITION_FOLLOWING ) &&
						( widgetAreaContainer.afterNode.compareDocumentPosition( elementNode ) & Node.DOCUMENT_POSITION_PRECEDING )
					);
					if ( isBounded ) {
						widgetContainerElement = widgetInstanceContainer.element;
					}
				} );

				if ( ! widgetContainerElement ) {
					widgetContainerElement = $(
						sidebarPartial.params.sidebarArgs.before_widget.replace( '%1$s', widgetId ).replace( '%2$s', 'widget' ) +
						sidebarPartial.params.sidebarArgs.after_widget
					);

					widgetContainerElement.attr( 'data-customize-partial-id', widgetPartial.id );
					widgetContainerElement.attr( 'data-customize-partial-type', 'widget_instance' );
					widgetContainerElement.attr( 'data-customize-widget-id', widgetId );

					/*
					 * Make sure the widget container element has the customize-container context data.
					 * The sidebar_instance_number is used to disambiguate multiple instances of the
					 * same sidebar are rendered onto the template, and so the same widget is embedded
					 * multiple times.
					 */
					widgetContainerElement.data( 'customize-partial-container-context', {
						'sidebar_id': sidebarPartial.sidebarId,
						'sidebar_instance_number': widgetAreaContainer.instanceNumber
					} );

					widgetAreaContainer.afterNode.parentNode.insertBefore( widgetContainerElement[0], widgetAreaContainer.afterNode );
				}
			} );

			return widgetPartial;
		},

		/**
		 * Handle change to the sidebars_widgets[] setting.
		 *
		 * @since 4.5.0
		 *
		 * @param {Array} newWidgetIds New widget ids.
		 * @param {Array} oldWidgetIds Old widget ids.
		 */
		handleSettingChange: function( newWidgetIds, oldWidgetIds ) {
			var sidebarPartial = this, sidebarContainers, needsRefresh, widgetsRemoved, widgetsAdded, addedWidgetInstancePartials = [];

			needsRefresh = (
				( oldWidgetIds.length > 0 && 0 === newWidgetIds.length ) ||
				( newWidgetIds.length > 0 && 0 === oldWidgetIds.length )
			);
			if ( needsRefresh ) {
				sidebarPartial.fallback();
				return;
			}

			// Handle removal of widgets.
			widgetsRemoved = _.difference( oldWidgetIds, newWidgetIds );
			_.each( widgetsRemoved, function( removedWidgetId ) {
				var widgetPartial = api.partial( 'widget_instance[' + removedWidgetId + ']' );
				if ( widgetPartial ) {
					_.each( widgetPartial.containers(), function( container ) {
						var isRemoved = (
							container.context.sidebar_id === sidebarPartial.sidebarId ||
							( container.context.sidebar_args && container.context.sidebar_args.id === sidebarPartial.sidebarId )
						);
						if ( isRemoved ) {
							container.element.remove();
						}
					} );
				}
			} );

			// Handle insertion of widgets.
			widgetsAdded = _.difference( newWidgetIds, oldWidgetIds );
			_.each( widgetsAdded, function( addedWidgetId ) {
				var widgetPartial = sidebarPartial.ensureWidgetInstanceContainers( addedWidgetId );
				addedWidgetInstancePartials.push( widgetPartial );
			} );

			sidebarContainers = sidebarPartial.containers();

			// Ensure that there are containers for all of the widgets, and that the order is correct.
			_.each( newWidgetIds, function( widgetId ) {
				var widgetPartial = sidebarPartial.ensureWidgetInstanceContainers( widgetId );
				if ( -1 !== _.indexOf( widgetsAdded, widgetId ) ) {
					addedWidgetInstancePartials.push( widgetPartial );
				}

				// Re-sort the DOM elements for the widgets.
				_.each( widgetPartial.containers(), function( widgetContainer ) {
					_.each( sidebarContainers, function( sidebarContainer ) {
						if ( sidebarContainer.instanceNumber === widgetContainer.context.sidebar_instance_number ) {
							sidebarContainer.afterNode.parentNode.insertBefore( widgetContainer.element[0], sidebarContainer.afterNode );
						}
					} );
				} );

				// @todo trigger event when the element is moved because some elements will need to be re-built. Or the document can just use MutationObservers.
			} );

			_.each( addedWidgetInstancePartials, function( widgetPartial ) {
				widgetPartial.refresh();
			} );
		},

		/**
		 * Note that the meat is handled in handleSettingChange because it has the context of which widgets were removed.
		 *
		 * @since 4.5.0
		 */
		refresh: function() {
			var partial = this, deferred = $.Deferred();

			deferred.fail( function() {
				partial.fallback();
			} );

			if ( 0 === partial.containers().length ) {
				deferred.reject();
			} else {
				deferred.resolve();
			}

			return deferred.promise();
		}
	});

	api.partialConstructor.widget_area = self.WidgetAreaPartial;
	api.partialConstructor.widget_instance = self.WidgetInstancePartial;

	/**
	 * Add partials for the registered widget areas (sidebars).
	 *
	 * @since 4.5.0
	 */
	self.addPartials = function() {
		_.each( self.registeredSidebars, function( registeredSidebar ) {
			var partial, partialId = 'widget_area[' + registeredSidebar.id + ']';
			partial = api.partial( partialId );
			if ( ! partial ) {
				partial = new self.WidgetAreaPartial( partialId, {
					params: {
						sidebarArgs: registeredSidebar
					}
				} );
				api.partial.add( partial.id, partial );
			}

			// Ensure there are partials created for each widget in the sidebar.
			api( 'sidebars_widgets[' + registeredSidebar.id + ']', function( setting ) {
				_.each( setting.get(), function( widgetId ) {
					partial.ensureWidgetInstanceContainers( widgetId );
				} );
			} );
		} );
	};

	/**
	 * Calculate the selector for the sidebar's widgets based on the registered sidebar's info.
	 *
	 * @since 3.9.0
	 */
	self.buildWidgetSelectors = function() {
		var self = this;

		$.each( self.registeredSidebars, function( i, sidebar ) {
			var widgetTpl = [
					sidebar.before_widget.replace( '%1$s', '' ).replace( '%2$s', '' ),
					sidebar.before_title,
					sidebar.after_title,
					sidebar.after_widget
				].join( '' ),
				emptyWidget,
				widgetSelector,
				widgetClasses;

			emptyWidget = $( widgetTpl );
			widgetSelector = emptyWidget.prop( 'tagName' );
			widgetClasses = emptyWidget.prop( 'className' );

			// Prevent a rare case when before_widget, before_title, after_title and after_widget is empty.
			if ( ! widgetClasses ) {
				return;
			}

			widgetClasses = widgetClasses.replace( /^\s+|\s+$/g, '' );

			if ( widgetClasses ) {
				widgetSelector += '.' + widgetClasses.split( /\s+/ ).join( '.' );
			}
			self.widgetSelectors.push( widgetSelector );
		});
	};

	/**
	 * Highlight the widget on widget updates or widget control mouse overs.
	 *
	 * @since 3.9.0
	 * @param  {string} widgetId ID of the widget.
	 */
	self.highlightWidget = function( widgetId ) {
		var $body = $( document.body ),
			$widget = $( '#' + widgetId );

		$body.find( '.widget-customizer-highlighted-widget' ).removeClass( 'widget-customizer-highlighted-widget' );

		$widget.addClass( 'widget-customizer-highlighted-widget' );
		setTimeout( function() {
			$widget.removeClass( 'widget-customizer-highlighted-widget' );
		}, 500 );
	};

	/**
	 * Show a title and highlight widgets on hover. On shift+clicking
	 * focus the widget control.
	 *
	 * @since 3.9.0
	 */
	self.highlightControls = function() {
		var self = this,
			selector = this.widgetSelectors.join( ',' );

		$( selector ).attr( 'title', this.l10n.widgetTooltip );

		$( document ).on( 'mouseenter', selector, function() {
			self.preview.send( 'highlight-widget-control', $( this ).prop( 'id' ) );
		});

		// Open expand the widget control when shift+clicking the widget element
		$( document ).on( 'click', selector, function( e ) {
			if ( ! e.shiftKey ) {
				return;
			}
			e.preventDefault();

			self.preview.send( 'focus-widget-control', $( this ).prop( 'id' ) );
		});
	};

	/**
	 * Parse a widget ID.
	 *
	 * @since 4.5.0
	 *
	 * @param {string} widgetId Widget ID.
	 * @returns {{idBase: string, number: number|null}}
	 */
	self.parseWidgetId = function( widgetId ) {
		var matches, parsed = {
			idBase: '',
			number: null
		};

		matches = widgetId.match( /^(.+)-(\d+)$/ );
		if ( matches ) {
			parsed.idBase = matches[1];
			parsed.number = parseInt( matches[2], 10 );
		} else {
			parsed.idBase = widgetId; // Likely an old single widget.
		}

		return parsed;
	};

	/**
	 * Parse a widget setting ID.
	 *
	 * @since 4.5.0
	 *
	 * @param {string} settingId Widget setting ID.
	 * @returns {{idBase: string, number: number|null}|null}
	 */
	self.parseWidgetSettingId = function( settingId ) {
		var matches, parsed = {
			idBase: '',
			number: null
		};

		matches = settingId.match( /^widget_([^\[]+?)(?:\[(\d+)])?$/ );
		if ( ! matches ) {
			return null;
		}
		parsed.idBase = matches[1];
		if ( matches[2] ) {
			parsed.number = parseInt( matches[2], 10 );
		}
		return parsed;
	};

	/**
	 * Convert a widget ID into a Customizer setting ID.
	 *
	 * @since 4.5.0
	 *
	 * @param {string} widgetId Widget ID.
	 * @returns {string} settingId Setting ID.
	 */
	self.getWidgetInstanceSettingId = function( widgetId ) {
		var parsed = this.parseWidgetId( widgetId ), settingId;

		settingId = 'widget_' + parsed.idBase;
		if ( parsed.number ) {
			settingId += '[' + String( parsed.number ) + ']';
		}

		return settingId;
	};

	api.bind( 'preview-ready', function() {
		$.extend( self, _wpWidgetCustomizerPreviewSettings );
		self.init();
	});

	return self;
})( jQuery, _, wp, wp.customize );
