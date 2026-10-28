import test from "node:test";
import assert from "node:assert/strict";

for (const failure of ["getter", "read", "write", "missing"]) {
  test(`mobile/full view remains selectable after storage ${failure} failure`, async () => {
    const names=["localStorage","window","document"],prior=Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
    const classes=new Set(),values=new Map([["vsfgm_mobile_loop","1"]]);
    const storage={getItem(key){if(failure==="read")throw Error("denied read");return values.get(key)||null;},setItem(key,value){if(failure==="write")throw Error("quota");values.set(key,value);}};
    try {
      Object.defineProperty(globalThis,"localStorage",failure==="getter"?{configurable:true,get(){throw Error("denied getter");}}:{configurable:true,value:failure==="missing"?null:storage});
      globalThis.window={innerWidth:390};
      globalThis.document={body:{classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},remove(name){classes.delete(name);}}}};
      const m=await import(`../public/lib/mobileLoop.js?recovery=${failure}`);
      assert.equal(m.isMobileModeEnabled(),true);
      m.setMobileModeEnabled(false);
      assert.equal(m.isMobileModeEnabled(390),false,"explicit Full View survives the next render");
      assert.equal(classes.has("mobile-loop-active"),false);
      m.setMobileModeEnabled(true);
      assert.equal(m.isMobileModeEnabled(1440),true,"explicit deck survives resize");
      assert.equal(classes.has("mobile-loop-active"),true);
      classes.add("mobile-nav-open");m.setMobileModeEnabled(true);
      assert.equal(classes.has("mobile-nav-open"),false);
      if(failure!=="write"&&failure!=="getter"&&failure!=="missing")assert.equal(values.get("vsfgm_mobile_loop"),"1");
    } finally {
      for(const name of names){if(prior[name])Object.defineProperty(globalThis,name,prior[name]);else delete globalThis[name];}
    }
  });
}

test("unavailable storage preserves viewport defaults until the player chooses",async()=>{
  const prior=Object.getOwnPropertyDescriptor(globalThis,"localStorage");
  try{
    Object.defineProperty(globalThis,"localStorage",{configurable:true,get(){throw Error("denied");}});
    const m=await import('../public/lib/mobileLoop.js?recovery=defaults');
    assert.equal(m.isMobileModeEnabled(390),true);
    assert.equal(m.isMobileModeEnabled(1440),false);
  }finally{if(prior)Object.defineProperty(globalThis,"localStorage",prior);else delete globalThis.localStorage;}
});
