const {instance} = require('../config/razorpay');
const Course = require("../models/Course");
const User = require("../models/User");
const mailSender = require("../utils/mailSender");
const {courseEnrollmentEmail} = require("../mail/templates/courseEnrollmentEmail");
const { default: mongoose, Mongoose } = require("mongoose");
const { paymentSuccessEmail } = require("../mail/templates/paymentSuccessEmail");
const crypto = require("crypto");
const CourseProgress = require("../models/CourseProgress")

exports.capturePayment = async (req, res) => {
    const {courses} = req.body;
    const userId =  req.user.id;

    if (courses.length === 0) {
        return res.json({
            success:false,
            message:"Provide courseId"
        })
    }

    let totalAmount = 0;

    for (const courseId of courses){
        let course;
        try {
            
            course = await Course.findById(courseId);
            if(!course){
                return res.status(200).json({
                    success:false,
                    message:"Course doesn't exist"
                })
            }

            const uid = new mongoose.Types.ObjectId(userId);
            if(course.studentsEnrolled.includes(uid)){
                return res.status(200).json({
                    success:false,
                    message:"User already registered"
                })
            }

            totalAmount += parseInt(course.price);

        } 
        catch (error) {
            return res.status(500).json({
                success:false,
                message:error.message
            })
        }
    }
    
    console.log("The amount in capturePayment is", totalAmount)
    const currency = "INR"
    const options = {
        amount: totalAmount * 100,
        currency,
        receipt: Math.random(Date.now()).toString()
    }

    try {
        const paymentResponse = await instance.orders.create(options)
        res.json({
            success:true,
            message: paymentResponse
        })
    } 
    catch (error) {
        console.log(error);
        return res.status(500).json({success:false, mesage:"Could not Initiate Order"});
    }
}

exports.verifyPayment = async (req,res) => {
    console.log("request in verifyPayment is", req)
    const razorpay_order_id = req.body?.razorpay_order_id;
    const razorpay_payment_id = req.body?.razorpay_payment_id;
    const razorpay_signature = req.body?.razorpay_signature;
    const courses = req.body?.courses;
    const userId = req.user.id;

    if(!razorpay_order_id ||
        !razorpay_payment_id ||
        !razorpay_signature || !courses || !userId) {
            return res.status(200).json({success:false, message:"Payment Failed"});
    }

    let body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_SECRET)
                                    .update(body.toString())
                                    .digest("hex")

    if (expectedSignature === razorpay_signature) {
        await enrollStudents(courses, userId, res);
        return res.status(200).json({success:true, message:"Payment Verified"});
    }
    return res.status(200).json({success:"false", message:"Payment Failed"});
}

const enrollStudents = async (courses, userId, res) => {
    if (!courses || !userId) {
        return res.status(400).json({success:false,message:"Please Provide data for Courses or UserId"});
    }

    for(const courseId of courses){
        try {
            const updatedCourse = await Course.findByIdAndUpdate(courseId,
                {
                    $push: {
                        studentsEnrolled: userId
                    }
                }, {new:true})  

            if (!updatedCourse) {
                return res.status(500).json({success:false,message:"Course not Found"});
            }

            const courseProgress = await CourseProgress.create({
                courseID:courseId,
                userId:userId,
                completedVideos: [],
            });

            // find the student and add the course to their list of enrolledCourses 
            const updatedStudent = await User.findByIdAndUpdate(userId, {
                $push: {
                    courses: courseId,
                    courseProgress: courseProgress._id,
                }
            }, {new: true})

            // student ko mail send karo
            const emailResponse = await mailSender(
                updatedStudent.email,
                `Successfully Enrolled into ${updatedCourse.courseName}`,
                courseEnrollmentEmail(updatedCourse.courseName, `${updatedStudent.firstName}`)
            )
        }
        catch (error) {
            console.log(error);
            return res.status(500).json({success:false, message:error.message});
        }
    }
}

exports.sendPaymentSuccessEmail = async (req,res) => {
    const {orderId, paymentId, amount} = req.body;

    const userId = req.user.id;

    if(!orderId || !paymentId || !amount || !userId) {
        return res.status(400).json({success:false, message:"Please provide all the fields"});
    }

    try {
        const user = await User.findById(userId);
        await mailSender(
            user.email,
            `Payment Received`,
            paymentSuccessEmail(`${user.firstName}`,
             amount/100,orderId, paymentId)
        )
    } catch (error) {
        console.log("error in sending mail", error)
        return res.status(500).json({success:false, message:"Could not send email"})
    }
}






