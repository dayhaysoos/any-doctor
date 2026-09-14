import {useEffect} from "react";useEffect(()=>{const h=setTimeout(()=>{},1);return ()=>{clearTimeout(h)}},[]);
import {useEffect} from "react";useEffect(()=>{setTimeout(()=>{},1)},[]);