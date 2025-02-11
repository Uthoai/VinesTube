import {asyneHandler} from "../utils/asyneHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import validator from 'validator';
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import {ApiResponse} from "../utils/ApiResponse.js";

// step for registerUser:-
// get user detail from frontend
// validation - not empty
// check if user already exist: username, email
// check for images, check for avater
// upload them to cloadinary, avater
// create user object - create entry in db
// remove password and refresh token field from response
// check for user creation
// return response

const registerUser = asyneHandler( async(req, res)=>{ 
    
    const {fullName, email, username, password} = req.body
    //console.log("User data:", fullName, email, username, password );
    
    // check all field is empty or not
    if (
        [fullName, email, username, password].some((field)=> field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required");  
    }

    // Validating email format
    if (!validator.isEmail(email)) {
        throw new ApiError(400, "Invalid email format");
    }

    // Password validation (must be at least 8 characters)
    if (password.length < 8) {
        throw new ApiError(400, "Password must be at least 8 characters long");
    }

    // check user is exist or not
    const existedUser = await User.findOne({
        $or: [{username}, {email}]
    })
    //console.log("existedUser: ", existedUser);
    
    if (existedUser) {
        throw new ApiError(409, "email /username already used.");
    }

    //console.log(req.files); // just check
    
    // check avater image path is empty or not
    const avatarLocalPath = req.files?.avatar[0]?.path;
    //const coverLocalPath =req.files?.coverImage[0]?.path;

    //console.log(avatarLocalPath);  // just check

    let coverLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverLocalPath = req.files.coverImage[0].path
    }

    if (!avatarLocalPath) {
        throw new ApiError(400,"avater is required.")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverLocalPath);

    if (!avatar) {
        throw new ApiError(400,"avater is required.")
    }

    // create user
    const user = await User.create({
        fullName: fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email: email,
        username: username.toLowerCase(),
        password: password,
    })

    // Avoid -password -refreshToken to response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while register in server..")
    }

    
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered Successfully")
    )

})

export {registerUser}

