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
	 * @todo Rename this to just WidgetPartial?
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
		 * @inheritdoc
		 * @param {wp.customize.selectiveRefreshPreview.Placement} placement
		 */
		renderContent: function( placement ) {
			var partial = this;
			if ( api.Partial.prototype.renderContent.call( partial, placement ) ) {
				api.preview.send( 'widget-updated', partial.widgetId );
				api.trigger( 'widget-updated', partial.widgetId, placement );
			}
		}
	});

	/**
	 * Partial representing a widget area.
	 *
	 * @todo Rename this to SidebarPartial?
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
			if ( partial.params.settings.length > 1 ) {
				throw new Error( 'Expected WidgetAreaPartial to only have one associated setting' );
			}
		},

		/**
		 * Set up the partial.
		 *
		 * @since 4.5.0
		 */
		ready: function() {
			var sidebarPartial = this;

			// Watch for changes to the sidebar_widgets setting.
			_.each( sidebarPartial.settings(), function( settingId ) {
				api( settingId ).bind( _.bind( sidebarPartial.handleSettingChange, sidebarPartial ) );
			} );

			// Trigger an event for this sidebar being updated whenever a widget inside is rendered.
			api.bind( 'partial-content-rendered', function( placement ) {
				var isAssignedWidgetPartial = (
					placement.partial.extended( self.WidgetInstancePartial ) &&
					( -1 !== _.indexOf( sidebarPartial.getWidgetIds(), placement.partial.widgetId ) )
				);
				if ( isAssignedWidgetPartial ) {

					// @todo Is this the right event?
					api.trigger( 'sidebar-updated', sidebarPartial.sidebarId, sidebarPartial );
				}
			} );

			// Make sure that a widget_instance partial has a container in the DOM prior to a refresh.
			api.bind( 'change', function( widgetSetting ) {
				var widgetId, parsedId;
				parsedId = self.parseWidgetSettingId( widgetSetting.id );
				if ( ! parsedId ) {
					return;
				}
				widgetId = parsedId.idBase;
				if ( parsedId.number ) {
					widgetId += '-' + String( parsedId.number );
				}

				_.each( sidebarPartial.settings(), function( settingId ) {
					var sidebarSetting = api( settingId ), sidebarWidgetIds;
					if ( ! sidebarSetting ) {
						return;
					}
					sidebarWidgetIds = sidebarSetting();
					if ( _.isArray( sidebarWidgetIds ) /*&& -1 !== _.indexOf( sidebarWidgetIds, widgetId )*/ ) {
						sidebarPartial.ensureWidgetInstanceContainers( widgetId );
					}
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
		 * Get the placements for this partial.
		 *
		 * @since 4.5.0
		 * @returns {Array}
		 */
		placements: function() {
			var partial = this;
			return _.map( partial.findDynamicSidebarBoundaryNodes(), function( boundaryNodes ) {
				return new api.selectiveRefreshPreview.Placement( {
					partial: partial,
					container: null,
					startNode: boundaryNodes.before,
					endNode: boundaryNodes.after,
					context: partial.params.sidebarArgs,
					instanceNumber: boundaryNodes.instanceNumber // @todo Let this be part of the context?
				} );
			} );
		},

		/**
		 * Get the list of widget IDs associated with this widget area.
		 *
		 * @since 4.5.0
		 *
		 * @returns {Array}
		 */
		getWidgetIds: function() {
			var sidebarPartial = this, settingId, widgetIds;
			settingId = sidebarPartial.settings()[0];
			if ( ! settingId ) {
				throw new Error( 'Missing associated setting.' );
			}
			if ( ! api.has( settingId ) ) {
				throw new Error( 'Setting does not exist.' );
			}
			widgetIds = api( settingId ).get();
			if ( ! _.isArray( widgetIds ) ) {
				throw new Error( 'Expected setting to be array of widget IDs' );
			}
			return widgetIds.slice( 0 );
		},

		/**
		 * Reflow widgets in the sidebar, ensuring they have the proper position in the DOM.
		 *
		 * @since 4.5.0
		 *
		 * @return {Array.<wp.customize.selectiveRefreshPreview.Placement>} List of placements that were reflowed.
		 */
		reflowWidgets: function() {
			var sidebarPartial = this, sidebarPlacements, widgetIds, widgetPartials, sortedSidebarContainers = [];
			widgetIds = sidebarPartial.getWidgetIds();
			sidebarPlacements = sidebarPartial.placements();

			widgetPartials = {};
			_.each( widgetIds, function( widgetId ) {

				// @todo This should only get the containers, not create them.
				widgetPartials[ widgetId ] = sidebarPartial.ensureWidgetInstanceContainers( widgetId );
			} );

			// Ensure that there are containers for all of the widgets, and that the order is correct.
			_.each( sidebarPlacements, function( sidebarPlacement ) {
				var sidebarWidgets = [], needsSort = false, thisPosition, lastPosition = -1;

				// Gather list of widget partial containers in this sidebar, and determine if a sort is needed.
				_.each( widgetPartials, function( widgetPartial ) {
					_.each( widgetPartial.placements(), function( widgetPlacement ) {

						// @todo Let sidebarPlacement.instanceNumber be part of context.
						if ( sidebarPlacement.instanceNumber === widgetPlacement.context.sidebar_instance_number ) {
							thisPosition = widgetPlacement.container.index();
							sidebarWidgets.push( {
								partial: widgetPartial,
								placement: widgetPlacement,
								position: thisPosition
							} );
							if ( thisPosition < lastPosition ) {
								needsSort = true;
							}
							lastPosition = thisPosition;
						}
					} );
				} );

				if ( needsSort ) {
					_.each( sidebarWidgets, function( sidebarWidget ) {
						sidebarPlacement.endNode.parentNode.insertBefore(
							sidebarWidget.placement.container[0],
							sidebarPlacement.endNode
						);

						// @todo Rename partial-placement-moved?
						api.trigger( 'partial-content-moved', sidebarWidget.placement );
					} );

					sortedSidebarContainers.push( sidebarPlacement );
				}
			} );

			if ( sortedSidebarContainers.length > 0 ) {
				api.trigger( 'sidebar-updated', sidebarPartial.sidebarId );
			}

			return sortedSidebarContainers;
		},

		/**
		 * Make sure there is a widget instance container in this sidebar for the given widget ID.
		 *
		 * @since 4.5.0
		 *
		 * @todo This is an expensive operation. Optimize.
		 *
		 * @param {string} widgetId
		 * @returns {wp.customize.Partial} Widget instance partial.
		 */
		ensureWidgetInstanceContainers: function( widgetId ) {
			var sidebarPartial = this, widgetPartial, wasInserted = false, partialId = 'widget_instance[' + widgetId + ']';
			widgetPartial = api.partial( partialId );
			if ( ! widgetPartial ) {
				widgetPartial = new self.WidgetInstancePartial( partialId, {
					params: {}
				} );
				api.partial.add( widgetPartial.id, widgetPartial );
			}

			// Make sure that there is a container element for the widget in the sidebar, if at least a placeholder.
			_.each( sidebarPartial.placements(), function( widgetAreaPlacement ) {
				var widgetContainerElement;

				// @todo Why are we doing this? We can just look for the placement that has a matching instanceNumber and sidebarId, right?
				_.each( widgetPartial.placements(), function( widgetInstancePlacement ) {
					var elementNode, isBounded;
					if ( ! widgetInstancePlacement.container ) {
						return;
					}
					elementNode = widgetInstancePlacement.container[0];
					isBounded = (
						( widgetAreaPlacement.startNode.compareDocumentPosition( elementNode ) & Node.DOCUMENT_POSITION_FOLLOWING ) &&
						( widgetAreaPlacement.endNode.compareDocumentPosition( elementNode ) & Node.DOCUMENT_POSITION_PRECEDING )
					);
					if ( isBounded ) {
						widgetContainerElement = widgetInstancePlacement.container;
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
					widgetContainerElement.data( 'customize-partial-placement-context', {
						'sidebar_id': sidebarPartial.sidebarId,
						'sidebar_instance_number': widgetAreaPlacement.instanceNumber
					} );

					widgetAreaPlacement.endNode.parentNode.insertBefore( widgetContainerElement[0], widgetAreaPlacement.endNode );
					wasInserted = true;
				}
			} );

			if ( wasInserted ) {
				sidebarPartial.reflowWidgets();
			}

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
			var sidebarPartial = this, needsRefresh, widgetsRemoved, widgetsAdded, addedWidgetInstancePartials = [];

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
					_.each( widgetPartial.placements(), function( placement ) {
						var isRemoved = (
							placement.context.sidebar_id === sidebarPartial.sidebarId ||
							( placement.context.sidebar_args && placement.context.sidebar_args.id === sidebarPartial.sidebarId )
						);
						if ( isRemoved ) {
							placement.container.remove();
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

			_.each( addedWidgetInstancePartials, function( widgetPartial ) {
				widgetPartial.refresh();
			} );

			api.trigger( 'sidebar-updated', sidebarPartial.sidebarId );
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

			if ( 0 === partial.placements().length ) {
				deferred.reject();
			} else {
				_.each( partial.reflowWidgets(), function( sidebarPlacement ) {
					api.trigger( 'partial-content-rendered', sidebarPlacement );
				} );
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
