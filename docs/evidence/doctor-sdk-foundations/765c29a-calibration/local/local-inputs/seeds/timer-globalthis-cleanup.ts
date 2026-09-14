import {useEffect} from "react";
useEffect(()=>{const timer=globalThis.setTimeout(()=>{},100);return ()=>globalThis.clearTimeout(timer);},[]);