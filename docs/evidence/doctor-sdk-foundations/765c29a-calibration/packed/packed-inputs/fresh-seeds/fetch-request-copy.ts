const c=new AbortController();const r=new Request("https://example.invalid",{signal:c.signal});fetch(new Request(r));
fetch("/positive");