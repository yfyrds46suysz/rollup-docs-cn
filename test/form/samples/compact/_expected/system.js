System.register(['external'],function(exports,module){'use strict';var x;return{setters:[function(module){x=module.default;}],execute:function(){exports('default',foo$$1);var self = {get default(){returnfoo$$1}};if(typeof Symbol!=='undefined'&&Symbol.toStringTag)Object.defineProperty(self,Symbol.toStringTag,{value:'Module'});elseObject.defineProperty(self,'toString',{value:function(){return'[object Module]';}});/*#__PURE__*/Object.freeze(self);console.log(self);
function foo$$1 () {
	console.log( x );
}}};});