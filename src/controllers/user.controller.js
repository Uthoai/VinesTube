import {asyneHandler} from "../utils/asyneHandler.js";


const registerUser = asyneHandler( async(req, res)=>{ 
    res.status(200).json({
        message: "Vinestube Register Done"
    })
})

export {registerUser}

