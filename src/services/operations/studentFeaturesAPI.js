import { toast } from "react-hot-toast";
import { studentEndpoints } from "../apis";
import { apiConnector } from "../apiconnector";
import rzpLogo from "../../assets/Logo/rzp_logo.png";
import { setPaymentLoading } from "../../slices/courseSlice";
import { resetCart } from "../../slices/cartSlice";

const {COURSE_PAYMENT_API, COURSE_VERIFY_API, SEND_PAYMENT_SUCCESS_EMAIL_API} = studentEndpoints;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        // Check if script already exists
        if(document.querySelector(`script[src="${src}"]`)) {
            resolve(true);
            return;
        }
        
        const script = document.createElement("script");
        script.src = src;

        script.onload = () => {
            resolve(true);
        };

        script.onerror = () => {
            console.error(`Failed to load script: ${src}`);
            resolve(false);
        };
        
        document.body.appendChild(script);
    });
}

export const buyCourse = async (token, courses, userDetails, navigate, dispatch) => {
    // Validate inputs before proceeding
    if (!token) {
        toast.error("Authentication token is missing. Please log in again.");
        return;
    }

    if (!courses || courses.length === 0) {
        toast.error("No courses selected for purchase");
        return;
    }

    if (!userDetails || !userDetails.firstName || !userDetails.email) {
        toast.error("User details are incomplete");
        return;
    }

    const toastId = toast.loading("Initializing payment...");
    dispatch(setPaymentLoading(true));

    try {
        // Load Razorpay SDK
        const res = await loadScript("https://checkout.razorpay.com/v1/checkout.js");
        
        if (!res) {
            toast.error("Failed to load payment gateway. Please check your internet connection and try again.");
            dispatch(setPaymentLoading(false));
            return;
        }

        // Initialize order
        const orderResponse = await apiConnector(
            "POST", 
            COURSE_PAYMENT_API,
            { courses },
            { Authorization: `Bearer ${token}` }
        );

        if (!orderResponse.data.success) {
            throw new Error(orderResponse.data.message || "Failed to initialize payment");
        }

        console.log("Order Initialized:", orderResponse.data);

        // *** DIRECT SOLUTION: Hardcode the Razorpay key from your .env file ***
        // For development environments only - use the key from your backend .env
        // In production, properly set REACT_APP_RAZORPAY_KEY in frontend environment
        let razorpayKey = "rzp_test_ptJQLTMsZL9Iug";
        
        // Configure payment options
        const options = {
            key: razorpayKey,
            currency: orderResponse.data.message.currency,
            amount: `${orderResponse.data.message.amount}`,
            order_id: orderResponse.data.message.id,
            name: "StudyNotion",
            description: "Thank You for Purchasing the Course",
            image: rzpLogo,
            prefill: {
                name: `${userDetails.firstName}`,
                email: userDetails.email
            },
            handler: function(response) {
                // Only proceed if response contains required fields
                if (response && response.razorpay_payment_id && response.razorpay_order_id && response.razorpay_signature) {
                    sendPaymentSuccessEmail(response, orderResponse.data.message.amount, token);
                    verifyPayment({...response, courses}, token, navigate, dispatch);
                } else {
                    toast.error("Payment response is incomplete");
                    dispatch(setPaymentLoading(false));
                }
            },
            modal: {
                ondismiss: function() {
                    toast.dismiss(toastId);
                    dispatch(setPaymentLoading(false));
                    toast.info("Payment cancelled");
                }
            }
        };

        // Open the Razorpay payment modal
        toast.dismiss(toastId);
        const paymentObject = new window.Razorpay(options);
        paymentObject.open();
        
        // Handle payment failures
        paymentObject.on("payment.failed", (response) => {
            dispatch(setPaymentLoading(false));
            toast.error(`Payment failed: ${response.error.description || "Unknown error"}`);
            console.error("Payment failed:", response.error);
        });
    } catch (error) {
        console.error("PAYMENT API ERROR:", error);
        
        // Provide more specific error messages based on the error type
        if (error.message.includes("Payment gateway configuration")) {
            toast.error("Payment system is not properly configured. Please contact support.");
        } else if (error.message.includes("Failed to initialize payment")) {
            toast.error("Could not initialize payment. Please try again later.");
        } else {
            toast.error(error.message || "Could not make payment. Please try again later.");
        }
        
        dispatch(setPaymentLoading(false));
        toast.dismiss(toastId);
    }
};

async function sendPaymentSuccessEmail(response, amount, token) {
    if (!response || !response.razorpay_order_id || !response.razorpay_payment_id || !amount || !token) {
        console.error("Missing required parameters for sending payment success email");
        return;
    }

    try {
        const emailResponse = await apiConnector(
            "POST", 
            SEND_PAYMENT_SUCCESS_EMAIL_API, 
            {
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                amount
            },
            { Authorization: `Bearer ${token}` }
        );
        
        if (!emailResponse.data.success) {
            console.warn("Payment success email sending failed:", emailResponse.data.message);
        }
    } catch (error) {
        console.error("PAYMENT SUCCESS EMAIL ERROR:", error);
        // Not showing toast here as it's not critical to the user experience
    }
}

async function verifyPayment(bodyData, token, navigate, dispatch) {
    if (!bodyData || !token) {
        toast.error("Verification data is missing");
        dispatch(setPaymentLoading(false));
        return;
    }

    const toastId = toast.loading("Verifying payment...");

    try {
        const response = await apiConnector(
            "POST", 
            COURSE_VERIFY_API, 
            bodyData,
            { Authorization: `Bearer ${token}` }
        );

        if (!response.data.success) {
            throw new Error(response.data.message || "Payment verification failed");
        }

        toast.success("Payment successful! You are now enrolled in the course.");
        navigate("/dashboard/enrolled-courses");
        dispatch(resetCart());
    } catch (error) {
        console.error("PAYMENT VERIFY ERROR:", error);
        toast.error(error.message || "Could not verify payment. Please contact support.");
    } finally {
        toast.dismiss(toastId);
        dispatch(setPaymentLoading(false));
    }
}