function fn () {
  console.log('lib2 fn');
}

function fn$1 () {
  fn();
  console.log('dep2 fn');
}

export { fn$1 as a };
//# sourceMappingURL=chunk-54f33655.js.map
