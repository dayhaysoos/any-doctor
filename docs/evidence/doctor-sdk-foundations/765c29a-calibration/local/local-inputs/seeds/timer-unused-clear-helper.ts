import {useEffect} from "react";
useEffect(()=>{const timer=setTimeout(()=>{},100);const cancel=()=>clearTimeout(timer);},[]);