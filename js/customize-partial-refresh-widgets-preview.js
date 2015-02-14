/*global jQuery, _wpCustomizePartialRefreshWidgets_exports, _ */
wp.customize.partialPreviewWidgets = ( function ( $ ) {
	'use strict';
	var self, oldWidgetsInit;

	self = {
		sidebars_eligible_for_post_message: [],
		widgets_eligible_for_post_message: [],
		render_widget_query_var: null,
		render_widget_nonce_value: null,
		render_widget_nonce_post_key: null,
		preview_customize_nonce: null,
		previewReady: $.Deferred(),
		settingTransports: {}
	};

	wp.customize.bind( 'preview-ready', function () {
		self.previewReady.resolve();
	} );

	$.extend( self, _wpCustomizePartialRefreshWidgets_exports );

	// Wrap the WidgetCustomizerPreview.init so that our init is executed immediately afterward
	oldWidgetsInit = wp.customize.WidgetCustomizerPreview.init;
	wp.customize.WidgetCustomizerPreview.init = function () {
		oldWidgetsInit.apply( wp.customize.WidgetCustomizerPreview, arguments );
		self.init();
	};

	/**
	 * Init
	 */
	self.init = function () {
		var self = this;
		self.preview = wp.customize.WidgetCustomizerPreview.preview;

		self.previewReady.done( function () {
			wp.customize.preview.bind( 'setting-transports', function ( transports ) {
				$.extend( self.settingTransports, transports );
			} );
			self.livePreview();
		} );
	};

	/**
	 * Send message to pane requesting all setting transports.
	 */
	self.updateSettingTransports = function () {
		wp.customize.preview.send( 'request-setting-transports' );
	};



	/**
	 * if the containing sidebar is eligible, and if there are sibling widgets the sidebar currently rendered
	 * @param {String} sidebarId
	 * @return {Boolean}
	 */
	self.sidebarCanLivePreview = function ( sidebarId ) {
		var widgetIds, renderedWidgetIds;
		if ( -1 === self.sidebars_eligible_for_post_message.indexOf( sidebarId ) ) {
			return false;
		}
		widgetIds = wp.customize( self.sidebar_id_to_setting_id( sidebarId ) )();
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
	 */
	self.refreshTransports = function () {


		// Step 1: request all transports from pane
		// @todo self.getSettingTransports( setting.id, widgetTransport );

		var changedToRefresh = false;
		$.each( _.keys( wp.customize.WidgetCustomizerPreview.renderedSidebars ), function ( i, sidebarId ) {
			var settingId, setting, sidebarTransport, widgetIds;

			settingId = self.sidebar_id_to_setting_id( sidebarId );
			setting = parent.wp.customize( settingId ); // @todo Eliminate use of parent by sending messages
			sidebarTransport = self.sidebarCanLivePreview( sidebarId ) ? 'postMessage' : 'refresh';
			if ( 'refresh' === sidebarTransport && 'postMessage' === setting.transport ) {
				changedToRefresh = true;
			}
			setting.transport = sidebarTransport;

			widgetIds = wp.customize( settingId ).get();
			$.each( widgetIds, function ( i, widgetId ){
				var settingId, setting, widgetTransport, idBase;
				settingId = self.widget_id_to_setting_id( widgetId );
				setting = parent.wp.customize( settingId ); // @todo Eliminate use of parent by sending messages
				widgetTransport = 'refresh';
				idBase = self.widget_id_to_base( widgetId );
				if ( sidebarTransport === 'postMessage' && ( -1 !== self.widgets_eligible_for_post_message.indexOf( idBase ) ) ) {
					widgetTransport = 'postMessage';
				}
				if ( 'refresh' === widgetTransport && 'postMessage' === setting.transport ) {
					changedToRefresh = true;
				}
				// @todo self.setSettingTransport( setting.id, widgetTransport );
				setting.transport = widgetTransport;
			} );
		} );
		if ( changedToRefresh ) {
			self.preview.send( 'refresh' );
		}
	};

	/**
	 *
	 */
	self.livePreview = function () {
		$.each( _.keys( wp.customize.WidgetCustomizerPreview.renderedSidebars ), function ( i, sidebarId ) {
			var settingId = self.sidebar_id_to_setting_id( sidebarId );
			wp.customize( settingId, function( setting ) {
				setting.id = settingId;
				setting.sidebarId = sidebarId;
				setting.bind( self.onChangeSidebarSetting );
			} );
		} );

		$.each( wp.customize.WidgetCustomizerPreview.renderedWidgets, function ( widgetId ) {
			var settingId = self.widget_id_to_setting_id( widgetId );
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
		} );

		// Create settings for newly-created widgets
		$.each( newSidebarWidgetIds, function ( i, widgetId ) {
			var settingId, setting, parentSetting;

			settingId = self.widget_id_to_setting_id( widgetId );
			setting = wp.customize( settingId );
			if ( ! setting ) {
				setting = wp.customize.create( settingId, {} );
			}

			// Force the callback to fire if this widget is newly-added
			if ( oldSidebarWidgetIds.indexOf( widgetId ) === -1 ) {
				self.refreshTransports();
				parentSetting = parent.wp.customize( settingId ); // @todo Eliminate use of parent by sending messages
				if ( 'postMessage' === parentSetting.transport ) {
					setting.callbacks.fireWith( setting, [ setting(), null ] );
				} else {
					self.preview.send( 'refresh' );
				}
			}
		} );

		// Remove widgets (their DOM element and their setting) when removed from sidebar
		$.each( oldSidebarWidgetIds, function ( i, oldWidgetId ) {
			if ( -1 === newSidebarWidgetIds.indexOf( oldWidgetId ) ) {
				var settingId = self.widget_id_to_setting_id( oldWidgetId );
				if ( wp.customize.has( settingId ) ) {
					wp.customize.remove( settingId );
					// @todo WARNING: If a widget is moved to another sidebar, we need to either not do this, or force a refresh when a widget is  moved to another sidebar
				}
				$( '#' + oldWidgetId ).remove();
			}
		} );

		// If a widget was removed so that no widgets remain rendered in sidebar, we need to disable postMessage
		self.refreshTransports();
		wp.customize.trigger( 'sidebar-updated', setting.sidebarId );
	};

	/**
	 *
	 * @this {wp.customize.Setting}
	 * @param newInstance
	 */
	self.onChangeWidgetSetting = function( newInstance ) {
		var setting, sidebarId, sidebarWidgets, data, customized;

		setting = this;
		if ( ! setting.widgetId ) {
			throw new Error( 'The setting ' + setting.id + ' does not look like a widget instance setting.' );
		}

		//if ( self.settingTransports[ setting.id ] !== 'postMessage' ) {
		//	return;
		//}

		sidebarId = null;
		sidebarWidgets = [];
		wp.customize.each( function ( sidebarSetting, settingId ) {
			var matches = settingId.match( /^sidebars_widgets\[(.+)\]/ );
			if ( matches && sidebarSetting().indexOf( setting.widgetId ) !== -1 ) {
				sidebarId = matches[1];
				sidebarWidgets = sidebarSetting();
			}
		} );
		if ( ! sidebarId ) {
			throw new Error( 'Widget does not exist in a sidebar.' );
		}
		data = {
			widget_id: setting.widgetId,
			nonce: self.preview_customize_nonce, // for Customize Preview
			wp_customize: 'on'
		};
		data[ self.render_widget_query_var ] = '1';
		customized = {};
		customized[ self.sidebar_id_to_setting_id( sidebarId ) ] = sidebarWidgets;
		customized[ setting.id ] = newInstance;
		data.customized = JSON.stringify( customized );
		data[ self.render_widget_nonce_post_key ] = self.render_widget_nonce_value;

		$( '#' + setting.widgetId ).addClass( 'customize-partial-refreshing' );

		$.post( self.request_uri, data, function ( r ) {
			if ( ! r.success ) {
				throw new Error( r.data && r.data.message ? r.data.message : 'FAIL' );
			}
			var oldWidget, newWidget, sidebarWidgets, position, beforeWidget, afterWidget;

			// @todo Fire jQuery event to indicate that a widget was updated; here widgets can re-initialize them if they support live widgets
			oldWidget = $( '#' + setting.widgetId );
			newWidget = $( r.data.rendered_widget );
			if ( newWidget.length && oldWidget.length ) {
				oldWidget.replaceWith( newWidget );
			} else if ( ! newWidget.length && oldWidget.length ) {
				oldWidget.remove();
			} else if ( newWidget.length && ! oldWidget.length ) {
				sidebarWidgets = wp.customize( self.sidebar_id_to_setting_id( r.data.sidebar_id ) )();
				position = sidebarWidgets.indexOf( setting.widgetId );
				if ( -1 === position ) {
					throw new Error( 'Unable to determine new widget position in sidebar' );
				}
				if ( sidebarWidgets.length === 1 ) {
					throw new Error( 'Unexpected postMessage for adding first widget to sidebar; refresh must be used instead.' );
				}
				if ( position > 0 ) {
					beforeWidget = $( '#' + sidebarWidgets[ position - 1 ] );
					beforeWidget.after( newWidget );
				}
				else {
					afterWidget = $( '#' + sidebarWidgets[ position + 1 ] );
					afterWidget.before( newWidget );
				}
			}
			self.preview.send( 'widget-updated', setting.widgetId );
			wp.customize.trigger( 'sidebar-updated', sidebarId );
			wp.customize.trigger( 'widget-updated', setting.widgetId );

			parent.wp.customize.control( setting.id ).active( 0 !== newWidget.length ); // @todo Eliminate use of parent by sending messages
			self.refreshTransports();
		} );
	};

	/**
	 * @param {String} widgetId
	 * @returns {String}
	 */
	self.widget_id_to_setting_id = function ( widgetId ) {
		var settingId, matches;
		matches = widgetId.match(/^(.+?)(?:-(\d+)?)$/);
		if ( matches ) {
			settingId = 'widget_' + matches[1] + '[' + matches[2] + ']';
		} else {
			settingId = 'widget_' + widgetId;
		}
		return settingId;
	};

	/**
	 * @param {String} widgetId
	 * @returns {String}
	 */
	self.widget_id_to_base = function ( widgetId ) {
		return widgetId.replace( /-\d+$/, '' );
	};

	/**
	 * @param {String} sidebarId
	 * @returns {string}
	 */
	self.sidebar_id_to_setting_id = function ( sidebarId ) {
		return 'sidebars_widgets[' + sidebarId + ']';
	};

	/**
	 * @param {String} settingId
	 * @returns {String|null} widgetId
	 */
	self.settingIdToWidgetId = function ( settingId ) {
		var widgetId, matches;
		matches = settingId.match( /^widget_(.+?)(?:\[(\d+)\])/ );
		if ( ! matches ) {
			return null;
		}
		widgetId = matches[1];
		if ( matches[2] ) {
			widgetId += '-' + matches[2];
		}
		return widgetId;
	};

	return self;
}( jQuery ));

