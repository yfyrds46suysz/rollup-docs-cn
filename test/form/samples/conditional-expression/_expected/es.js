// side-effect in condition
var a = foo() ? 1 : 2;

var unknownValue = bar();

// unknown branch with side-effect
var c = unknownValue ? foo() : 2;
var d = unknownValue ? 1 : foo();

// known side-effect
var h = foo();
var i = foo();
