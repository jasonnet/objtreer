# objtreer
library for object tree processing for stringification

# testing

```
    yarn build && yarn test
```

or if already built...

```
    yarn test
```

# building

The way this module support both CJS and ES modules is by including
a build step.  Without this step, this module will often not
work.  For example, if one wants to `yarn add ../objtreer` this module 
in to another project, one will need to have already run 
build against this directory.

```
    yarn build
```


