const Joi = require("joi");

// Schema for a single form object
const formSchema = Joi.object({
  id: Joi.alternatives()
    .try(Joi.number(), Joi.string().pattern(/^fld_[a-z0-9]+$/))
    .optional(),
  name: Joi.string().required().trim().max(255),
  intro: Joi.string().allow("").default(""),
  status: Joi.number().valid(0, 1).default(0),
  structure: Joi.array()
    .items(
      Joi.object({
        id: Joi.string()
          .pattern(/^fld_[a-z0-9]+$/)
          .required(),
        type: Joi.string()
          .valid("text_multi", "radio", "checkboxes", "boolean")
          .required(),
        description: Joi.string().required(),
        required: Joi.boolean().required(),
        options: Joi.when("type", {
          is: Joi.valid("radio", "checkboxes"),
          then: Joi.array().items(Joi.string()).min(1).required(),
          otherwise: Joi.array().max(0),
        }),
        renderAs: Joi.string().valid("radio", "dropdown").optional(),
        correctAnswer: Joi.alternatives()
          .try(Joi.string().allow("", null), Joi.array().items(Joi.string()))
          .optional(),
      })
    )
    .required(),
}).unknown(true); // Allow other DB fields like public_id during validation

const bulkFormSchema = Joi.array().items(formSchema).min(1).required();

const validateForm = (req, res, next) => {
  // For PUT requests, make name and structure optional to allow status-only updates
  const schema =
    req.method === "PUT"
      ? formSchema.fork(["name", "structure"], (s) => s.optional())
      : formSchema;

  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error)
    return res
      .status(400)
      .json({
        error: "Validation Failed",
        details: error.details.map((d) => d.message),
      });
  req.body = value;
  next();
};

const validateBulkData = (data) => {
  return bulkFormSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });
};

module.exports = { validateForm, validateBulkData };
