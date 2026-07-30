import { signIn, signOut, useSession } from "next-auth/react"
import { Button } from "@base-ui/react"

export const Appbar=()=>{
    const session = useSession()
    return <div className="border-b px-2 py-2 flex justify-between">
        <div>
            CEX
        </div>
        <div>
            {session.data?.user ? 
            <Button onClick={()=>signOut()}> 
                Logout
            </Button>: <Button onClick={()=>signIn()}> 
                SignIn
            </Button>}
        </div>
    </div>
}