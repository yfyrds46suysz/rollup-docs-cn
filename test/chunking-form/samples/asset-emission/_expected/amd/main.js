define(['module', 'require', './nested/chunk'], function (module, require, __chunk_1) { 'use strict';

	var logo = new URL(module.uri + '/../assets/logo1-25253976.svg', document.baseURI).href;

	__chunk_1.showImage(logo);
	new Promise(function (resolve, reject) { require(['./nested/chunk2'], resolve, reject) });

});
