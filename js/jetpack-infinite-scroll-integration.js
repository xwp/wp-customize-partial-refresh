(function( api, $ ) {

	/**
	 * Trigger Jetpack Infinite Scroll's post-load event so ME.js and other dynamic
	 * elements can be rebuilt.
	 *
	 * @param {object}               args
	 * @param {wp.customize.Partial} args.partial
	 * @param {string|object}        args.content
	 * @param {object}               args.context
	 * @param {jQuery}               args.newContainerElement
	 * @param {jQuery}               args.oldContainerElement
	 */
	api.bind( 'partial-content-rendered', function( args ) {
		if ( _.isString( args.content ) ) {
			$( document.body ).trigger( 'post-load', { html: args.content } );
		}
	} );

	// Add partials when new posts are added.
	$( document.body ).on( 'post-load', function( e, response ) {
		if ( response.html && -1 !== response.html.indexOf( 'data-customize-partial' ) ) {
			api.selectiveRefreshPreview.addPartials();
		}
	} );

}( wp.customize, jQuery ) );
