/*global jQuery, _wpCustomizePartialRefreshWidgets_exports */
wp.customize.partialPreviewWidgets = ( function ( $, api ) {
	'use strict';

	var self = {
		sidebarsEligibleForPostMessage: [],
		widgetsEligibleForPostMessage: [], // idBases
		widgetsExcludedForPostMessage: {}, // keyed by widgetId
		ready: $.Deferred()
	};

	$.extend( self, _wpCustomizePartialRefreshWidgets_exports );

	self.init = function () {
		api.bind( 'add', self.setDefaultWidgetTransport );
	};

	self.ready.done( function () {
		api.previewer.bind( 'request-setting-transports', self.sendSettingTransports );
		api.previewer.bind( 'update-setting', self.updateSetting );
		api.previewer.bind( 'update-control', self.updateControl );
		api.previewer.bind( 'refresh', self.refreshPreview );
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
	 *
	 * @param {wp.customize.Class} instance
	 * @param {object} params
	 * @param {string} params.id
	 * @private
	 */
	self._updateInstance = function ( instance, params ) {
		params = $.extend( {}, params );
		delete params.id;
		_.each( params, function ( value, key ) {
			if ( '_' === key.substr( 0, 1 ) ) {
				throw new Error( 'Attempted to update private property.' );
			}

			var existingProp = instance[ key ];
			if ( existingProp && existingProp.extended && existingProp.extended( wp.customize.Value ) ) {
				existingProp.set( value );
			} else {
				instance[ key ] = value;
			}
		} );
	};

	/**
	 * Update a setting instance.
	 *
	 * @param {object} params
	 * @param {string} params.id
	 * @param {boolean} params.transport
	 */
	self.updateSetting = function ( params ) {
		if ( ! params.id ) {
			throw new Error( 'Missing setting id' );
		}
		wp.customize( params.id, function ( setting ) {
			self._updateInstance( setting, params );
		} );
	};

	/**
	 * Update a control instance.
	 *
	 * @param {object} params
	 * @param {string} params.id
	 * @param {boolean} params.active
	 */
	self.updateControl = function ( params ) {
		if ( ! params.id ) {
			throw new Error( 'Missing control id' );
		}
		wp.customize.control( params.id, function ( control ) {
			self._updateInstance( control, params );
		} );
	};

	/**
	 * Refresh the preview.
	 */
	self.refreshPreview = function () {
		wp.customize.previewer.refresh();
	};

	/**
	 * When a new widget setting is added, set the proper default transport.
	 *
	 * @this {wp.customize.Values}
	 * @param {wp.customize.Setting} setting
	 */
	self.setDefaultWidgetTransport = function ( setting ) {
		var parsed, widgetId, canUsePostMessage;

		parsed = wp.customize.Widgets.parseWidgetSettingId( setting.id );
		if ( ! parsed ) {
			return;
		}
		widgetId = parsed.idBase;
		if ( parsed.number ) {
			widgetId = '-' + parsed.number.toString();
		}

		canUsePostMessage = (
			-1 !== _.indexOf( self.widgetsEligibleForPostMessage, parsed.idBase ) &&
			! self.widgetsExcludedForPostMessage[ widgetId ]
		);
		if ( canUsePostMessage ) {
			setting.transport = 'postMessage';
		}
	};

	api.bind( 'ready', function () {
		self.ready.resolve();
	} );

	self.init();

	return self;
}( jQuery, wp.customize ));

