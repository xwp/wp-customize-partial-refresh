/* global twttr, _customizeSelectiveRefreshJetpackExports */

/**
 * Integrate Customize Partial Refresh with Jetpack.
 *
 * @param {object}  api - wp.customize
 * @param {object}  $
 * @param {object}  exports
 * @param {boolean} exports.themeSupportsInfiniteScroll
 * @param {boolean} exports.infiniteScrollModuleActive
 */
(function( api, $, exports ) {

	/**
	 * Handle rendering of partials.
	 *
	 * @param {object}               args
	 * @param {wp.customize.Partial} args.partial
	 * @param {string|object}        args.content
	 * @param {object}               args.context
	 * @param {jQuery}               args.newContainer
	 * @param {jQuery}               args.oldContainer
	 */
	api.bind( 'partial-content-rendered', function( args ) {

		// Trigger Jetpack Infinite Scroll's post-load event so ME.js and other dynamic elements can be rebuilt.
		if ( exports.themeSupportsInfiniteScroll && exports.infiniteScrollModuleActive && _.isString( args.content ) ) {
			$( document.body ).trigger( 'post-load', { html: args.content } );
		}

		// (Re-)initialize Twitter widgets.
		if ( 'undefined' !== typeof twttr && twttr.widgets && twttr.widgets.load ) {
			twttr.widgets.load( args.newContainer[0] );
		}
	} );

	/**
	 * Handle moving of partials (normally widgets).
	 *
	 * @param {object}               args
	 * @param {wp.customize.Partial} args.partial
	 * @param {object}               args.context
	 * @param {jQuery}               args.container
	 */
	api.bind( 'partial-content-moved', function( args ) {

		// Refresh a partial containing a Twitter timeline iframe, since it has to be re-built.
		if ( args.container.find( 'iframe.twitter-timeline:not([src]):first' ).length ) {
			args.partial.refresh();
		}
	} );

	// Add partials when new posts are added for infinite scroll.
	if ( exports.themeSupportsInfiniteScroll && exports.infiniteScrollModuleActive ) {
		$( document.body ).on( 'post-load', function( e, response ) {
			if ( response.html && -1 !== response.html.indexOf( 'data-customize-partial' ) ) {
				api.selectiveRefreshPreview.addPartials();
			}
		} );
	}

}(
	wp.customize,
	jQuery,
	'undefined' !== typeof _customizeSelectiveRefreshJetpackExports ? _customizeSelectiveRefreshJetpackExports : null
) );
