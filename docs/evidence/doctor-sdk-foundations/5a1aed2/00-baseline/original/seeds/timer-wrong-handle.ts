import {useEffect} from "react";
useEffect(()=>{const first=setTimeout(()=>{},100);const second=setTimeout(()=>{},100);return ()=>clearTimeout(first);},[]);