/*global jQuery, JSON, _wpCustomizePartialRefreshWidgetsExports, _ */
wp.customize.partialPreviewWidgets = ( function ( $ ) {
	'use strict';
	var self, oldWidgetsInit;

	self = {
		sidebarsEligibleForPostMessage: [],
		widgetsEligibleForPostMessage: [], // list of idBases
		widgetsExcludedForPostMessage: {}, // keyed by widgetId
		renderWidgetQueryVar: null,
		renderWidgetNonceValue: null,
		renderWidgetNoncePostKey: null,
		previewCustomizeNonce: null,
		previewReady: $.Deferred(),
		registeredSidebars: {},
		requestUri: '/',
		theme: {
			active: false,
			stylesheet: ''
		}
	};

	wp.customize.bind( 'preview-ready', function () {
		self.previewReady.resolve();
	} );

	$.extend( self, _wpCustomizePartialRefreshWidgetsExports );

	// Wrap the WidgetCustomizerPreview.init so that our init is executed immediately afterward
	oldWidgetsInit = wp.customize.WidgetCustomizerPreview.init;
	wp.customize.WidgetCustomizerPreview.init = function () {
		oldWidgetsInit.apply( wp.customize.WidgetCustomizerPreview, arguments );
		self.init();
	};

	self.SettingTransportProxy = wp.customize.Value.extend({
		initialize: function( id, transport, options ) {
			wp.customize.Value.prototype.initialize.call( this, transport, options );
			this.id = id;

			// Sync the new transport to the parent
			this.bind( 'change', function ( newTransport ) {
				wp.customize.preview.send( 'update-setting', {
					id: this.id,
					transport: newTransport
				} );
			} );
		}
	});

	self.settingTransports = new wp.customize.Values({
		defaultConstructor: self.SettingTransportProxy,
		get: function ( id ) {
			if ( this.has( id ) ) {
				return this( id ).get();
			} else {
				return null;
			}
		},
		set: function ( id, value ) {
			if ( ! this.has( id ) ) {
				return this.create( id, id, value );
			} else {
				return this( id ).set( value );
			}
		}
	});

	/**
	 * Bootstrap functionality.
	 */
	self.init = function () {
		var self = this;
		self.preview = wp.customize.WidgetCustomizerPreview.preview;

		// Improve lookup of registered sidebars via map of sidebar ID to sidebar object
		_.each( wp.customize.WidgetCustomizerPreview.registeredSidebars, function ( sidebar ) {
			self.registeredSidebars[ sidebar.id ] = sidebar;
		} );

		self.previewReady.done( function () {
			wp.customize.preview.bind( 'active', function () {
				self.requestSettingTransports();
			} );
			wp.customize.preview.bind( 'setting-transports', function ( transports ) {
				$.each( transports, function ( settingId, transport ) {
					self.settingTransports.set( settingId, transport );
				} );
				self.settingTransports.trigger( 'updated' );
			} );

			// Currently customize-preview.js is not creating settings for dynamically-created settings in the pane; so we have to do it
			wp.customize.preview.bind( 'setting', function( args ) {
				var id, value;
				args = args.slice();
				id = args.shift();
				value = args.shift();
				if ( ! wp.customize.has( id ) ) {
					wp.customize.create( id, value ); // @todo This should be in core
				}
			});

			self.livePreview();
		} );
	};

	/**
	 * Send message to pane requesting all setting transports.
	 *
	 * Returned promise is resolved once the parent window sends back the message.
	 *
	 * @returns {jQuery.Deferred}
	 */
	self.requestSettingTransports = function () {
		var promise, once;
		promise = $.Deferred();
		once = function () {
			self.settingTransports.unbind( 'updated', once );
			promise.resolveWith( self.settingTransports );
		};
		self.settingTransports.bind( 'updated', once );
		wp.customize.preview.send( 'request-setting-transports' );
		return promise;
	};

	/**
	 * if the containing sidebar is eligible, and if there are sibling widgets the sidebar currently rendered
	 * @param {String} sidebarId
	 * @return {Boolean}
	 */
	self.sidebarCanLivePreview = function ( sidebarId ) {
		var widgetIds, renderedWidgetIds;
		if ( -1 === self.sidebarsEligibleForPostMessage.indexOf( sidebarId ) ) {
			return false;
		}
		widgetIds = wp.customize( wp.customize.Widgets.sidebarIdToSettingId( sidebarId ) )();
		renderedWidgetIds = _( widgetIds ).filter( function ( widgetId ) {
			return 0 !== $( '#' + widgetId ).length;
		} );
		return ( renderedWidgetIds.length !== 0 );
	};

	/**
	 * We can only know if a sidebar can be live-previewed by letting the
	 * preview tell us, so this updates the parent's transports to
	 * postMessage when it is available. If there is a switch from
	 * postMessage to refresh, the preview window will request a refresh.
	 *
	 * @returns {jQuery.Deferred}
	 */
	self.refreshTransports = function () {
		var promise;

		promise = self.requestSettingTransports();

		promise.done( function () {
			var settingTransports = this, changedToRefresh = false;
			$.each( _.keys( wp.customize.WidgetCustomizerPreview.renderedSidebars ), function ( i, sidebarId ) {
				var settingId, sidebarTransport, widgetIds;

				settingId = wp.customize.Widgets.sidebarIdToSettingId( sidebarId );
				sidebarTransport = self.sidebarCanLivePreview( sidebarId ) ? 'postMessage' : 'refresh';
				if ( 'refresh' === sidebarTransport && 'postMessage' === settingTransports.get( settingId ) ) {
					changedToRefresh = true;
				}
				settingTransports.set( settingId, sidebarTransport );

				widgetIds = wp.customize( settingId ).get();
				$.each( widgetIds, function ( i, widgetId ){
					var settingId, widgetTransport, idBase, canUsePostMessage;
					settingId = wp.customize.Widgets.widgetIdToSettingId( widgetId );

					widgetTransport = 'refresh';
					idBase = wp.customize.Widgets.parseWidgetId( widgetId ).idBase;
					canUsePostMessage = (
						( -1 !== _.indexOf( self.widgetsEligibleForPostMessage, idBase ) ) &&
						( ! self.widgetsExcludedForPostMessage[ widgetId ] )
					);
					if ( sidebarTransport === 'postMessage' && canUsePostMessage ) {
						widgetTransport = 'postMessage';
					}
					if ( 'refresh' === widgetTransport && 'postMessage' === settingTransports.get( settingId ) ) {
						changedToRefresh = true;
					}
					settingTransports.set( settingId, widgetTransport );
				} );
			} );
			if ( changedToRefresh ) {
				self.preview.send( 'refresh' );
			}
		} );

		return promise;
	};

	/**
	 * Set up widget and sidebar settings to be live-previewed if eligible.
	 */
	self.livePreview = function () {
		$.each( _.keys( wp.customize.WidgetCustomizerPreview.renderedSidebars ), function ( i, sidebarId ) {
			var settingId = wp.customize.Widgets.sidebarIdToSettingId( sidebarId );
			wp.customize( settingId, function( setting ) {
				setting.id = settingId;
				setting.sidebarId = sidebarId;
				setting.bind( self.onChangeSidebarSetting );
			} );
		} );

		$.each( wp.customize.WidgetCustomizerPreview.renderedWidgets, function ( widgetId ) {
			var settingId = wp.customize.Widgets.widgetIdToSettingId( widgetId );
			wp.customize( settingId, function ( setting ) {
				setting.id = settingId;
				setting.widgetId = widgetId;
				setting.bind( self.onChangeWidgetSetting );
			} );
		} );

		// Opt-in to LivePreview
		self.refreshTransports();
	};

	/**
	 * Callback for a change to a sidebars_widgets[x] setting.
	 *
	 * @this {wp.customize.Setting}
	 * @param {array} newSidebarWidgetIds
	 * @param {array} oldSidebarWidgetIds
	 */
	self.onChangeSidebarSetting = function( newSidebarWidgetIds, oldSidebarWidgetIds ) {
		var setting = this;

		// Sort widgets
		// @todo instead of appending to the parent, we should append relative to the first widget found
		$.each( newSidebarWidgetIds, function ( i, widgetId ) {
			var widget = $( '#' + widgetId );
			widget.parent().append( widget );
			// @todo if a widget does not support partial-refresh, then this should technically trigger a refresh
			// @todo widget.trigger( 'customize-widget-sorted' ) so that a widget can re-initialize any dynamic iframe content
		} );

		// Trigger insertions for newly-added widgets
		$.each( newSidebarWidgetIds, function ( i, widgetId ) {
			var widgetSettingId;

			// Skip a widget that was previously rendered
			if ( wp.customize.WidgetCustomizerPreview.renderedWidgets[ widgetId ] ) {
				return;
			}

			widgetSettingId = wp.customize.Widgets.widgetIdToSettingId( widgetId );
			wp.customize( widgetSettingId, function ( widgetSetting ) {
				widgetSetting.id = widgetSettingId; // @todo this should be be in core
				widgetSetting.widgetId = widgetId;
				self.handleWidgetInsert( widgetSetting );
			} );
		} );

		// Remove widgets (their DOM element and their setting) when removed from sidebar
		$.each( oldSidebarWidgetIds, function ( i, oldWidgetId ) {
			var settingId, setting;
			// Abort if the old widget still exists in the new sidebar
			if ( -1 !== _.indexOf( newSidebarWidgetIds, oldWidgetId ) ) {
				return;
			}
			delete wp.customize.WidgetCustomizerPreview.renderedWidgets[ oldWidgetId ];
			settingId = wp.customize.Widgets.widgetIdToSettingId( oldWidgetId );
			setting = wp.customize( settingId );
			if ( setting ) {
				setting.unbind( self.onChangeWidgetSetting );
				wp.customize.remove( settingId );
				// @todo WARNING: If a widget is moved to another sidebar, we need to either not do this, or force a refresh when a widget is  moved to another sidebar
			}
			$( '#' + oldWidgetId ).remove();
		} );

		// If a widget was removed so that no widgets remain rendered in sidebar, we need to disable postMessage
		self.refreshTransports();
		wp.customize.trigger( 'sidebar-updated', setting.sidebarId );
	};

	/**
	 * Handle inserting a widget setting into the document.
	 *
	 * @param {wp.customize.Setting} widgetSetting
	 * @param {string} widgetSetting.widgetId
	 * @returns {boolean} true if the widget is indeed to be inserted
	 */
	self.handleWidgetInsert = function ( widgetSetting ) {
		if ( ! widgetSetting.widgetId ) {
			throw new Error( 'Attempted to call on a non-widget setting.' );
		}

		// Skip widget if it is already rendered
		if ( wp.customize.WidgetCustomizerPreview.renderedWidgets[ widgetSetting.widgetId ] ) {
			return false;
		}

		wp.customize.WidgetCustomizerPreview.renderedWidgets[ widgetSetting.widgetId ] = true;
		widgetSetting.bind( self.onChangeWidgetSetting ); // ideally core would have jQuery.Callbacks have the unique flag set

		self.requestSettingTransports().done( function () {
			var settingTransports = this;
			if ( 'postMessage' === settingTransports( widgetSetting.id ).get() ) {
				self.onChangeWidgetSetting.call( widgetSetting, widgetSetting.get(), null );
			} else {
				self.preview.send( 'refresh' );
			}
		} );
		return true;
	};

	/**
	 * Callback for change to a widget_x[y] setting.
	 *
	 * @this {wp.customize.Setting}
	 * @param newInstance
	 */
	self.onChangeWidgetSetting = function( newInstance ) {
		var setting, sidebarId, sidebarWidgets, data, customized, event;

		setting = this;
		if ( ! setting.widgetId ) {
			throw new Error( 'The setting ' + setting.id + ' does not look like a widget instance setting.' );
		}

		sidebarId = null;
		sidebarWidgets = [];
		wp.customize.each( function ( sidebarSetting, settingId ) {
			var matches = settingId.match( /^sidebars_widgets\[(.+)\]/ );
			if ( matches && self.registeredSidebars[ matches[1] ] && sidebarSetting().indexOf( setting.widgetId ) !== -1 ) {
				if ( sidebarId ) {
					// WARNING: widget exists in multiple sidebars
					return;
				}
				sidebarId = matches[1];
				sidebarWidgets = sidebarSetting();
			}
		} );
		data = {
			widget_id: setting.widgetId,
			sidebar_id: sidebarId,
			nonce: self.previewCustomizeNonce, // for Customize Preview
			wp_customize: 'on'
		};
		if ( ! self.theme.active ) {
			data.theme = self.theme.stylesheet;
		}
		data[ self.renderWidgetQueryVar ] = '1';
		customized = {};
		customized[ wp.customize.Widgets.sidebarIdToSettingId( sidebarId ) ] = sidebarWidgets;
		customized[ setting.id ] = newInstance;
		data.customized = JSON.stringify( customized );
		data[ self.renderWidgetNoncePostKey ] = self.renderWidgetNonceValue;

		// Allow plugins to prevent a partial refresh or to supply the data.sidebar_id
		event = $.Event( 'widget-partial-refresh-request' );
		$( document ).trigger( event, [ data ] );
		if ( event.isDefaultPrevented() || ! data.sidebar_id ) {
			self.preview.send( 'refresh' );
			return;
		}

		$( '#' + setting.widgetId ).addClass( 'customize-partial-refreshing' );

		$.post( self.requestUri, data, function ( r ) {
			if ( ! r.success ) {
				throw new Error( r.data && r.data.message ? r.data.message : 'FAIL' );
			}
			var oldWidget, newWidget, sidebarWidgets, position, beforeWidget, afterWidget, placementFailed = false;

			// @todo Fire jQuery event to indicate that a widget was updated; here widgets can re-initialize them if they support live widgets
			oldWidget = $( '#' + setting.widgetId );
			newWidget = $( r.data.rendered_widget );
			if ( newWidget.length && oldWidget.length ) {
				oldWidget.replaceWith( newWidget );
			} else if ( ! newWidget.length && oldWidget.length ) {
				oldWidget.remove();
			} else if ( newWidget.length && ! oldWidget.length ) {
				sidebarWidgets = wp.customize( wp.customize.Widgets.sidebarIdToSettingId( r.data.sidebar_id ) )();
				position = sidebarWidgets.indexOf( setting.widgetId );
				if ( -1 === position ) {
					throw new Error( 'Unable to determine new widget position in sidebar' );
				}
				if ( sidebarWidgets.length === 1 ) {
					throw new Error( 'Unexpected postMessage for adding first widget to sidebar; refresh must be used instead.' );
				}

				if ( position > 0 ) {
					beforeWidget = $( '#' + sidebarWidgets[ position - 1 ] );
				}
				if ( position <= 0 ) {
					afterWidget = $( '#' + sidebarWidgets[ position + 1 ] );
				}

				if ( beforeWidget && beforeWidget.length ) {
					beforeWidget.after( newWidget );
				} else if ( afterWidget && afterWidget.length ) {
					afterWidget.before( newWidget );
				} else {
					placementFailed = true;
				}
			}

			_.each( r.data.other_rendered_widget_ids, function ( widgetId ) {
				// @todo we need to eventually allow nested widgets to be rendered
				self.widgetsExcludedForPostMessage[ widgetId ] = true;
			} );

			_.each( [ setting.widgetId ].concat( r.data.other_rendered_widget_ids ), function ( renderedWidgetId ) {
				self.preview.send( 'widget-updated', renderedWidgetId );
				wp.customize.trigger( 'widget-updated', renderedWidgetId );
			} );

			wp.customize.trigger( 'sidebar-updated', sidebarId );

			if ( placementFailed ) {
				self.preview.send( 'refresh' );
			} else {
				self.refreshTransports();
				wp.customize.preview.send( 'update-control', {
					id: setting.id, // the setting ID and the control ID are the same
					active: 0 !== newWidget.length
				} );
			}
		} );
	};

	return self;
}( jQuery ));

