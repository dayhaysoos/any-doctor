import {useEffect} from "react";
useEffect(()=>{let timer=0;const start=()=>{timer=setTimeout(()=>{},100);};start();return ()=>clearTimeout(timer);},[]);