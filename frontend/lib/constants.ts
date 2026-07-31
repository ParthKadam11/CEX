import { Connection } from "@solana/web3.js"

const TOKEN_PRICE_REFRESH_INTERVAL = 60*1000; //every 1min
const LAST_UPDATED= null


export const SUPPORTED_TOKENS:{
    name:string,
    mint:string
}[] = [{
    name:"USDC",
    mint:"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
},{
    name:"USDT",
    mint:"Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
}]

export const connection = new Connection("https://api.devnet.solana.com")


export function getSupportedTokens(){
    if(!LAST_UPDATED || new Date().getTime() - LAST_UPDATED < TOKEN_PRICE_REFRESH_INTERVAL){

    }
}

getSupportedTokens()