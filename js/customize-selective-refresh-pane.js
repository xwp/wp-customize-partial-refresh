/* global jQuery, wp */
( function( $, api ) {
	'use strict';

	api.bind( 'ready', function() {
		api.previewer.bind( 'focus-control-for-setting', function( settingId ) {
			var matchedControl;
			api.control.each( function( control ) {
				var settingIds = _.pluck( control.settings, 'id' );
				if ( -1 !== _.indexOf( settingIds, settingId ) ) {
					matchedControl = control;
				}
			} );

			if ( matchedControl ) {
				matchedControl.focus();
			}
		} );
	} );

}( jQuery, wp.customize ) );
