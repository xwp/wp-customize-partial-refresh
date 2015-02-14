/*global jQuery, _wpCustomizePartialRefreshWidgets_exports */
wp.customize.partialPreviewWidgets = ( function ( $, api ) {
	'use strict';

	var self = {
		sidebarsEligibleForPostMessage: [],
		widgetsEligibleForPostMessage: [],
		ready: $.Deferred()
	};

	$.extend( self, _wpCustomizePartialRefreshWidgets_exports );

	self.init = function () {
		api.bind( 'add', self.setDefaultWidgetTransport );
	};

	self.ready.done( function () {
		api.previewer.bind( 'request-setting-transports', self.sendSettingTransports );
	} );

	/**
	 * Send the settings' transports from the pane to the preview.
	 */
	self.sendSettingTransports = function () {
		var transports = {};
		wp.customize.each( function ( setting ) {
			transports[ setting.id ] = setting.transport;
		} );
		api.previewer.send( 'setting-transports', transports );
	};

	/**
	 * When a new widget setting is added, set the proper default transport.
	 *
	 * @this {wp.customize.Values}
	 * @param {wp.customize.Setting} setting
	 */
	self.setDefaultWidgetTransport = function ( setting ) {
		var parsed = wp.customize.Widgets.parseWidgetSettingId( setting.id );
		if ( parsed && -1 !== _.indexOf( self.widgetsEligibleForPostMessage, parsed.idBase ) ) {
			setting.transport = 'postMessage';
		}
	};

	api.bind( 'ready', function () {
		self.ready.resolve();
	} );

	self.init();

	return self;
}( jQuery, wp.customize ));

