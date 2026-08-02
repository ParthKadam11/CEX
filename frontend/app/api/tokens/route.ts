import { NextRequest } from "next/server";
import {getAccount, getAssociatedTokenAddress } from "@solana/spl-token"
import { connection, SUPPORTED_TOKENS } from "@/lib/constants";
import { PublicKey } from "@solana/web3.js";

async function getAccountBalance(token:{
    name:string,
    mint:string
},address:string) {
    //ata = associated token account
    //pda = program derived address
    const ata = await getAssociatedTokenAddress(new PublicKey(token.mint),  new PublicKey(address))
    const account = await getAccount(connection,ata)    
}


function getPrice(){
    

}

export async function GET(req:NextRequest){
    const {searchParams} = new URL(req.url)
    const address= searchParams.get('address') as string   
    const balance = await Promise.all(SUPPORTED_TOKENS.map(token=> getAccountBalance(token, address)))
    


}

