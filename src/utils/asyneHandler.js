const asyneHandler = (requestHandler)=>{
    return async(req, res, next)=>{
        Promise.resolve(requestHandler(req, res, next)).catch((err)=> next(err))
    }
}

export {asyneHandler}

// const asyneHandler = (fnc) => async(req, res, next)=> {
//     try {
//         await fnc(req, res, next)
//     } catch (error) {
//         res.status(error.code || 500).json({
//             success: false,
//             message: error.message
//         })
//     }
// }
