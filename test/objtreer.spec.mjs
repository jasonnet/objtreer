import {strict as assert} from 'assert';
import {stringify} from '../dist/mjs/objtreer.js';
//const {lastCharsOf} = require('./lastchars.cjs')


describe('basic testing', () => {
    it('basic test',(done)=> {

      let a = {x:'x',six:6}
      let b = {a, y:'y',w1:{w2:{ a}}};
      a.b = b;

      let resp = stringify(a);
      assert.equal(resp,'{"x":"x","six":6,"b":{"a":"refTo^","y":"y","w1":{"w2":"maxdepth"}}}');
      done();
    });  
});

