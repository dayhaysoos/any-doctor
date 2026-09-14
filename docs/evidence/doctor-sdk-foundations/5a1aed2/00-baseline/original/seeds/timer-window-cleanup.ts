import {useEffect} from "react";
useEffect(()=>{const timer=window.setTimeout(()=>{},100);return ()=>window.clearTimeout(timer);},[]);