const c=new AbortController();fetch("/",{__proto__:{signal:c.signal}});
fetch("/positive");