(function( api ) {

	api.Widgets.WidgetModel.prototype.transport = 'postMessage';

	api.bind( 'add', function( setting ) {
		if ( /^(sidebars_widgets\[|widget_)/ ) {
			setting.transport = 'postMessage';
		}
	} );

}( wp.customize ) );
