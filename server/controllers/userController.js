import User from '../models/UserModel.js'
import SendEmail, { WelcomeEmail } from '../utils/Email.js'
import bcryptjs from 'bcryptjs'
import { generateAccessToken, generateRefreshToken } from '../utils/generateAccessAndRefreshToken.js'
import findUser from '../utils/findUserByrefreshToken.js'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'


const register = async (req, res) => {

    const body = req.body;
    const { firstname, lastname, email, password } = body;

    try {
        if (!firstname || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const user = await User.findOne({ email });
        if (user) {
            return res.status(409).json({ message: "Provided email is already registered" });
        }

        const hashedPassword = await bcryptjs.hash(password, 10);

        const newUser = await User.create({ firstname, lastname, email, password: hashedPassword });
        return res
            .status(201)
            .json(
                {
                    message: "User created successfully",
                    data: newUser,
                    success: true
                }
            );
    } catch (error) {
        return res.status(409).json({
            message: error.message,
            error: error,
        });
    }

}

const otp = async (req, res) => {
    try {
        const body = req.body;
        const { email, otp } = body;

        const response = await SendEmail(email, otp);

        if (response?.success === true) {
            return res
                .status(200)
                .json(
                    {
                        message: "OTP sent successfully",
                        data: response,
                        success: true
                    }
                );
        }
        return res.status(500).json({ message: "Email sending failed" });
    } catch (error) {
        return res.status(500).json({
            message: error.message,
            error: error,
        })
    }
}



const login = async (req, res) => {

    try {
        const body = req.body;
        const { email, password } = body;

        if (!email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isPasswordCorrect = await user.isPasswordCorrect(password);

        if (!isPasswordCorrect) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const accessToken = await generateAccessToken(user._id);
        const refreshToken = await generateRefreshToken(user._id);

        // WelcomeEmail(user.email, user.firstname)

        return res.cookie('refreshToken', refreshToken.refreshToken, { httpOnly: true, secure: true, sameSite: 'none' }).status(200).json({
            message: "Login successfully",
            data: { user, AccessToken: accessToken.accessToken, RefreshToken: refreshToken.refreshToken },
            success: true
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message,
            error: error,
        });
    }
}

const getUser = async (req, res) => {
    try {

        const refreshToken = req.body.refreshToken

        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

        const UserId = decoded._id

        const user = await User.findById(UserId)

        return res.status(200).json({
            user,
            success: true
        });
    } catch (error) {
        return {
            message: error.message,
            error: error,
        };
    }
}

const logout = async (req, res) => {

    try {

        const refreshToken = req.body.refreshToken

        if (!refreshToken) {
            return res.status(404).json({ message: "Refresh token not found" });
        }

        const userId = await findUser(refreshToken);

        await User.findByIdAndUpdate(
            userId,
            {
                $unset: {
                    refreshToken: 1 // this removes the field from document
                }
            },
            {
                new: true
            }
        )

        res
            .clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'none' })
            .status(200)
            .json({
            message: "Logout successfully",
            success: true
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message,
            error: error,
        });
    }
}

const updateUser = async (req, res) => {

    try {

        const body = req.body;
        const { refreshToken, firstname, lastname, password } = body;

        if (!firstname) {
            return res.status(404).json({ message: "firstname is required" });
        }

        const userId = await findUser(refreshToken);

        await User.findByIdAndUpdate(userId, { firstname: firstname, lastname: lastname, password: password }, { new: true })
        return res
            .status(200)
            .json(
                {
                    message: "User updated successfully",
                    success: true
                }
            );
        
    } catch (error) {

        res.status(500).json({
            message: error.message,
            error: error,
        });
        
    }

}


const addUserAddress = async (req, res) => {
    try {
        const body = req.body;
        const { refreshToken, phone, address } = body;
    
        if (!phone) {
            return res.status(404).json({ message: "phone is required" });
        }
    
        if (!address) {
            return res.status(404).json({ message: "address is required" });
        }
    
        const userId = await findUser(refreshToken);
    
        await User.findByIdAndUpdate(userId, { phoneNumber: phone, address: address }, { new: true })
    
        return res
            .status(200)
            .json(
                {
                    message: "Address updated successfully",
                    success: true
                }
            );
    
    } catch (error) {
        res.status(500).json({
            message: error.message,
            error: error,
        });
    }
}


const getUserCart = async (req, res) => {
    try {

        const refreshToken = req.body

        if (!refreshToken) {
            return res.status(404).json({ message: "Refresh token not found" });
        }

        const id = await findUser(refreshToken.refreshToken);

        const carts = await User.aggregate([
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(id)
                }
            },
            {
                $lookup: {
                    from: "carts",
                    localField: "_id",
                    foreignField: "userId",
                    as: "cartDetals",
                    pipeline: [
                        {
                            $lookup: {
                                from: "products",
                                localField: "productId",
                                foreignField: "_id",
                                as: "productDetals",
                                pipeline: [
                                    {
                                        $project: {
                                            name: 1,
                                            image: 1,
                                            price: 1
                                        }
                                    }
                                ]

                            }
                        },
                        {
                            $addFields: {
                                productDetals: {
                                    $first: "$productDetals"
                                }
                            }
                        },
                        {
                            $addFields: {
                                totalAmount: {
                                    $multiply: ["$quantity", "$productDetals.price"]
                                }
                            }
                        },
                        {
                            $project: {
                                productDetals: 1,
                                quantity: 1,
                                totalAmount: 1
                            }
                        }
                    ]
                }
            },
            {
                $addFields: {
                    totalCarts: {
                        $size: "$cartDetals"
                    }
                }
            },
            {
                $project: {
                    cartDetals: 1,
                    totalCarts: 1,
                    quantity: 1
                }
            }
        ])

        return res.status(200).json({ message: "User cart", data: carts[0], success: true });
    } catch (error) {
        res.status(500).json({
            message: error.message,
            error: error,
        });
    }
}


export { register, otp, login, getUser, logout, updateUser, addUserAddress, getUserCart }