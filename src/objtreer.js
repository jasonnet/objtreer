/*
PSA: If code occassionally directs non-json to stdout, each line of even that plain text will 
be hoovered up and sent to elastic search.  It will not be very searchable, but there will be 
a `@timestamp` field and a `log` field.  The .log field will be the text of the line sent to 
stdout.  There will also be plenty of kubernetes fields.  As an example, the following record 
was collected from the dev environment elastic search/kibana:

    @timestamp  Mar 23, 2022 @ 09:40:11.142
    _id  3k4Bt38BAAjQ0a4fukC3
    _index  cloud-dev-2022.03.23
    _score   - 
    _type  _doc
    kubernetes.annotations.kubernetes.io/psp  eks.privileged
    kubernetes.container_hash  332566483108.dkr.ecr.us-east-1.amazonaws.com/xio-cloud/api-ext-signaling@sha256:1c7ea54a0fbacc8d5e310bc61564ee043a3124b51ead3b52a02998c4f040dbcc
    kubernetes.container_image  332566483108.dkr.ecr.us-east-1.amazonaws.com/xio-cloud/api-ext-signaling:feature.logging20220214.4793d41
    kubernetes.container_name  api-ext-signaling
    kubernetes.docker_id  0a1ecbb40fe856b0a28f1b92298d23a93dd3e978976da6ebf1ad4c393b661a67
    kubernetes.host  ip-10-3-3-174.ec2.internal
    kubernetes.labels.app.kubernetes.io/instance  api-ext-signaling
    kubernetes.labels.app.kubernetes.io/name  api-ext-signaling
    kubernetes.labels.pod-template-hash  b474d745b
    kubernetes.namespace_name  default
    kubernetes.pod_id  1abf8f17-3b3e-42fa-a46f-acfefcf9df24
    kubernetes.pod_name  api-ext-signaling-b474d745b-cxsf2
    log  I sent this msg to stdout                                     <------- the actual line of stdout text
    stream  stdout
    time  Mar 23, 2022 @ 09:40:11.142
*/


/**
 * Return a copy of the specified object tree that is suitable for being called
 * by JSON.stringify().  All reference loops will be removed.  The tree will not be 
 * copied below a certain depth and instead that subtree will be expressed with 
 * a brief string representing that subtree.  Multiple references to the same 
 * object have all but the first simply express a reference to the first.  This 
 * reduces the size of the overall rendering.  
 * 
 * Certain other 
 * difficult objects will have their own custom renderings.  As an example, 
 * a pointer to a function will use a special rendering of the function that
 * lists it's probable name as well.   The Error object also has a custom
 * rendering that includes a few levels of call stack, but no CRLF characters.
 * 
 * An earlier implementation of this method called JSON.stringify and then cleaned
 * up only subsections of the tree that JSON.stringify failed to render.
 * This implementation no longer does that.  The reason for that is that having 
 * part of the tree be converted and part of it not converted makes the correct 
 * implementation of redudant object matching complicated/bug-prone.
 * 
 * This implementation uses breadth first search because BFS tends to identify 
 * the shortest path to an object. 
 * 
 * @param {integer} maxDepth 
 * @param {object}  objIn 
 * @param {object} finder   The .needle field should be the string to scan for when 
 *                          traversing.  Upon return the .foundPaths field will be 
 *                          a list of locations at which that string is found.
 * @param {string}   objName 
 * @returns A different object tree  with no objects or arrays in common, but which
 *      can be rendered with JSON.stringify to produce a reasonable rendering even
 *      in the face of redundant objects.
 */
function bfsCopyTree(maxDepth, objIn, finder, objName='') {
  //console.log('objIn');  printObjIdTree(8,objIn);
  let needle = finder?.needle;
  if (needle) {
    finder.foundPaths = [];
  }
  const queue = [];
  //maxDepth = 9;   don't use this line.  Instead code that calls this module should use withMaxDepth(9)
  const forMappings = new WeakMap();
  const forMappings2Path = new WeakMap();

  /**
   * Queue up a record.  When later processed we'll essentially do
   * 
   *   newSafeObjectWeCreate = makeItSafe(toObj);
   *   fromObjDst[accessName] = newSafeObjectWeCreate
   * 
   * @param {string} fromPath  A human readable string explaining the path through the structure to reach the fromObjDst obj.
   * @param {object} fromObjDst 
   * @param {*} accessName  Usually/?always? a string
   * @param {object} toObj  An object from the original structure.
   * @param {integer} depth  How deep we are in to the object traversal
   */
  function addObjToQueue(fromPath, fromObjDst, accessName, toObj, depth) {
    queue.push({fromPath, fromObjDst, accessName, toObj, depth});
  }
  let dst = [];
  addObjToQueue(objName,dst,0,objIn,0);
  //console.log('queue',queue)
  while (queue.length) {
    let qelement = queue.shift();
    const objType = typeof qelement.toObj;
    if (['number','undefined','boolean','string'].includes(objType)) {
      let newObj = qelement.toObj;
      qelement.fromObjDst[qelement.accessName] = newObj;
      if (needle) {
        let haystack = ''+newObj;
        if (haystack.indexOf(needle)>=0) {
          let newPathname = qelement.fromPath+((qelement.fromObjDst instanceof Array)?'['+qelement.accessName+']':'.'+qelement.accessName);
          newPathname = newPathname.substring(3);  // remove the leading '[0]'
          finder.foundPaths.push(newPathname);
        }
      }
    } else if (objType === 'function') {
      // This is an odd situation.  
      // JSON.stringify(objIn)   returns undefined
      // objIn.toString()   returns the body of the function
      // objIn.name      returns the name of the method reliably... when it has one
      // objIn.displayName    returns undefined most of the time
      // console.log(objIn)   returns  something like: [Function: removeListener]  but can return a much larger string if the function has as lot of properties: 
      //                                               [Function: Redis] { uid: 'yXEXDH', pubClient: RedisClient { _events: [Object: null prototype] { newListener: [Function (anonymous)], error: [Function: onError]...
      try {
        // let count1=0; for (fn of objIn) { count1++; }   // always throws an exception  'xxxx is not iterable' exception
        // let count2=0; for (fn in objIn) { count2++; }   // almost always returns 0
        let count3=0;
        let names3='';
        try {
          Object.getOwnPropertyNames(objIn).forEach(function (key) {
            count3++;
            names3 += ' '+key;
          })
        } catch (exc) {
          count3 = 'w';
        }
        let newObj = '[Function: '+objIn.name+' propnames:'+names3+']';
        qelement.fromObjDst[qelement.accessName] = newObj;
      } catch (exc) {
        // TODO: is this dead code?
        console.warn('enountered an exception processing a function pointer:', exc);
        let newObj = '[Function]';  // This line probably is dead code
        qelement.fromObjDst[qelement.accessName] = newObj;
      }
      // TODO: is it possible to encounter the same function twice in the same object tree?  If so, can we mark them as the same?
    } else if (objType === 'object') {
      if (qelement.toObj === null) {
        qelement.fromObjDst[qelement.accessName] = null;
      } else if (qelement.toObj instanceof Error) {
        const errObj = qelement.toObj;
        let newObj = {message:errObj.message,stack:'pruned'};
        if (typeof errObj.stack === 'string') {  // possibly provide a better value for the .stack member
          // Typically the .stack value begins with the .message string and then a newline followed by a string representation of the call stack.
          // We assume here  that the stack descriptions begins with the second line of the .stack value and try to extract some of that.
          let idx = errObj.stack.indexOf('\n',0);  
          if (idx>-1) {
            const maxCharactersToExtract = 250;
            let idx2 = idx+1+maxCharactersToExtract;
            if (idx2<errObj.stack.length) {
              newObj.stack = errObj.stack.substring(idx+1,idx2)+'...';
            } else {
              newObj.stack = errObj.stack.substring(idx+1);
            }
          } else {
            // leave the default .stack value we used above  
          }
        }
        forMappings.set(errObj,newObj);
        if (qelement.fromObjDst instanceof Array) {
          forMappings2Path.set(errObj,qelement.fromPath+'['+qelement.accessName+']');
        } else {
          forMappings2Path.set(errObj,qelement.fromPath+'.'+qelement.accessName);
        }
        qelement.fromObjDst[qelement.accessName] = newObj;
      } else {
        // The object has the potential to recurse
        let newObj;
        let forObj = forMappings.get(qelement.toObj);
        if (forObj!==undefined) {
          // TODO: use loop syntax vvvv instead of passing the found object.  (aka objName)
          let atString = forMappings2Path.get(qelement.toObj).substring(3); // substring 3 because there will be a leading [0] in the string
          newObj = 'refTo^'+atString;
        } else if (qelement.depth === maxDepth) {
          // Warning: Above we try to match objects even at this depth.  But we will not achieve that consistently.  Ex.  If we see an object one or more times here, we don't try to record the fact that we've seen it and coverted it to max-depth.  But if it appears later at a higher level, we will fully elaborate it.  Ideally we'd then update what we emit here to reference that, but we won't,
          // TODO: we could keep a dictionary of object id's and then populate and reference it here.  And then reference that again if we see the struct again even at a different level.  We'd want to do the same for "alreadySeen", but we actually like to use a path for that rather than a reference number.
          // TODO: or we could make a preliminary traversal over the tree recording the highest level occurance of a given object.
          newObj = 'maxdepth';
        } else if (qelement.toObj instanceof Array) {
          newObj = [];
          forMappings.set(qelement.toObj,newObj);
          const newPathname = qelement.fromPath+((qelement.fromObjDst instanceof Array)?'['+qelement.accessName+']':'.'+qelement.accessName);
          forMappings2Path.set(qelement.toObj,newPathname);
          for (let idx = 0; idx<qelement.toObj.length; idx++) {
            let val = qelement.toObj[idx];
            addObjToQueue(newPathname, newObj, idx, val, qelement.depth+1);
          }
        } else {
          // generic object
          newObj = {};
          //console.log('ln227 forMappings'); printObjIdTree(2,forMappings)
          //console.log('ln228 objIn');       printObjIdTree(6,objIn)
          forMappings.set(qelement.toObj,newObj);
          const newPathname = qelement.fromPath+((qelement.fromObjDst instanceof Array)?'['+qelement.accessName+']':'.'+qelement.accessName);
          forMappings2Path.set(qelement.toObj,newPathname);

          let propnames = Object.getOwnPropertyNames(qelement.toObj);
          if ((propnames.length===0) && qelement.toObj.toJSON) propnames = Object.getOwnPropertyNames(qelement.toObj.toJSON());  // this can be handy for object like an object created by WebRTC's peer.createOffer().  All of it's properties are invisible to the Object.getOwnPropertyNames function.
          //console.log('ln230 forMappings'); printObjIdTree(2,forMappings)
          propnames.forEach(function (key) {
            let val = '[field-not-accessible]';
            try {
                val = qelement.toObj[key];
            } catch (exc) {
                // This can happen exc.message == TypeError: 'caller', 'callee', and 'arguments' properties may not be accessed on strict mode functions or the arguments objects for calls to them
            }
            addObjToQueue(newPathname, newObj, key, val, qelement.depth+1);
          })
          //console.log('ln236 forMappings'); printObjIdTree(2,forMappings)
          //console.log('ln237 newObj'); printObjIdTree(6,newObj)
        }
        //console.log('newObj');  printObjIdTree(8,newObj);
        qelement.fromObjDst[qelement.accessName] = newObj;
      }
    } else {
      console.warn('objType warn',objType)  
    }  
  }
  let retval = dst[0];
  //console.log('retval')
  //require('./objtreer2.cjs').printObjIdTree(8,retval);   // debug.  Locally uncomment this line if inexplicably the struture we're about to return seems incorrect.  For this line to work you'll need to copy /dev/objtreer2.cjs to this directory.  Please don't commit that file in this directory and please don't change the path of this require statement to access that file in its commited location.  (We want our deployment to fail quickly if someone accidentally commits code in a way that causes the objtreer2 code to be run anywhere besides their own dev laptop.)
  //JSON.stringify('retval',retval);  // if we've removed all the loops, this line should not throw an exception
  return retval;
}


// Purpose: mostly for developers wanting to find where they can find the specied value in an unfamiliar object tree.  This method is unlikely to be called in production.
function logLocationInObjectTree(objIn, needle) {
  const maxDepth = 8;
  const finder = {needle }
  bfsCopyTree(maxDepth, objIn, finder, '' );
  // We return a value here for the sake of unit testing the bulk of the implementation.  We do not expect *code* to actually be interested in the value returned.
  return finder.foundPaths;
}

function stringify(objIn, maxDepth=3) {
  let safeObj = bfsCopyTree(maxDepth, objIn);

  // We stringify in part because we want one _log request to produce exactly one output line.  Certain objects have .toString methods that violate that or that hide too much detail of the object.
  return JSON.stringify(safeObj);
}

export                     {stringify,logLocationInObjectTree,bfsCopyTree};  //spp:mjs
//spp:cjs module.exports = {stringify,logLocationInObjectTree,bfsCopyTree};
