import { fn } from './chunk-bd892da6.js';

function fn$1 () {
  console.log('lib1 fn');
}

function fn$2 () {
  fn$1();
  console.log('dep3 fn');
}

class Main2 {
  constructor () {
    fn$2();
    fn();
  }
}

export default Main2;
