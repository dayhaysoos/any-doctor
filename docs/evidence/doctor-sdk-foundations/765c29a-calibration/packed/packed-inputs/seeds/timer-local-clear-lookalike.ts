import {useEffect} from "react";
useEffect(()=>{const clearTimeout=()=>{}; const timer=setTimeout(()=>{},100);return ()=>clearTimeout(timer);},[]);