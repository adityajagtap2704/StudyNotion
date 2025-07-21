const Category = require('../models/Category');
const Course = require('../models/Course')

function getRandomInt(max) {
    return Math.floor(Math.random() * max)
  }

exports.createCategory = async (req,res) =>{
    try {
        const {name, description} =  req.body;

        if(!name || !description){
            return res.status(401).json({
                success:false,
                message:"Tag name or description not available"
            })
        };

        const newCategory = await Category.create({
            name,
            description
        })

        if (!newCategory) {
            return res.status(401).json({
                success:false,
                message:"Error in pushing new tag to db"
            }) 
        }

        return res.status(200).json({
            success:true,
            message:"Categories created successfully"
        })
    } catch (error) {
        return res.status(500).json({
            success:false,
            message:error.message
        })
    }
}

exports.showAllCategories = async (req,res) => {

    try {
        const allCategories =  await Category.find({},{name:true,
                                        description:true});
        
            return res.status(200).json({
                success:true,
                message:"All tags received",
                data:allCategories
            })  
    } catch (error) {
        return res.status(500).json({
            success:false,
            message:error.message
        })
    }
}

exports.categoryPageDetails = async (req, res) => {
  try {
    const { categoryId } = req.body
    console.log("PRINTING CATEGORY ID: ", categoryId);
    
    // Get courses for the specified category - use lowercase 'published' to match schema
    const selectedCategory = await Category.findById(categoryId)
      .populate({
        path: "course",
        match: { status: "published" }, // Changed to lowercase to match schema
        populate: "ratingAndReviews",
      })
      .exec()

    // Handle the case when the category is not found
    if (!selectedCategory) {
      console.log("Category not found.")
      return res
        .status(404)
        .json({ success: false, message: "Category not found" })
    }
    
    // Handle the case when there are no courses
    if (!selectedCategory.course || selectedCategory.course.length === 0) {
      console.log("No courses found for the selected category.")
      return res.status(404).json({
        success: false,
        message: "No courses found for the selected category.",
      })
    }

    // Get courses for other categories
    const categoriesExceptSelected = await Category.find({
      _id: { $ne: categoryId },
      course: { $exists: true, $not: { $size: 0 } }
    })
    
    let differentCourses = null
    if (categoriesExceptSelected && categoriesExceptSelected.length > 0) {
      const randomIndex = getRandomInt(categoriesExceptSelected.length)
      differentCourses = await Category.findById(
        categoriesExceptSelected[randomIndex]._id
      )
        .populate({
          path: "course",
          match: { status: "published" }, // Changed to lowercase
          populate: "ratingAndReviews",
        })
        .exec()
    }

    // Get top-selling courses across all categories
    const mostSellingCourses = await Course.find({ status: 'published' }) // Changed to lowercase
      .sort({ studentsEnrolled: -1 }) // Sort by studentsEnrolled field
      .limit(10) // Limit to top 10
      .populate("ratingAndReviews")
      .exec();

    res.status(200).json({
      selectedCourses: selectedCategory,
      differentCourses: differentCourses,
      mostSellingCourses,
      name: selectedCategory.name,
      description: selectedCategory.description,
      success: true
    })
  } catch (error) {
    console.error("Error in categoryPageDetails:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
}