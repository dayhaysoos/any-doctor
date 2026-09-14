import {useEffect} from "react";
useEffect(()=>{const timer=setTimeout(()=>{},100);return ()=>{const timer=0;clearTimeout(timer);};},[]);