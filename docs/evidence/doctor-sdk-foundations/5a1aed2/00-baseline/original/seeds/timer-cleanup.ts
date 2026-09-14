import {useEffect} from "react";
useEffect(()=>{const timer=setTimeout(()=>{},100);return ()=>clearTimeout(timer);},[]);