import { body, param, validationResult } from 'express-validator';
import { ApiError, DEPARTMENTS, PRIORITIES, ROLES, TASK_STATUSES } from './utils.js';

// Runs the chains, then reports the first problem in the usual { success, data, error } envelope.
// Route handlers still apply the business rules (permissions, state transitions, uniqueness).
export const validate = (...chains) => [
  ...chains,
  (req, _res, next) => {
    const result = validationResult(req);
    if (!result.isEmpty()) return next(new ApiError(400, result.array({ onlyFirstError: true })[0].msg));
    next();
  },
];

const PHONE = /^(\+?998)?\d{9}$/;
const isPhone = (v) => typeof v === 'string' && PHONE.test(v.replace(/[\s()-]/g, ''));
const PHONE_MSG = "Telefon raqam +998 dan keyin 9 ta raqamdan iborat bo'lishi kerak";

const idParam = param('id').isInt({ min: 1 }).withMessage("Noto'g'ri ID");
const text = (field, max, required, msg) => {
  const chain = body(field);
  return (required ? chain.exists({ values: 'falsy' }).withMessage(msg).bail() : chain.optional({ values: 'null' }))
    .isString()
    .withMessage(msg)
    .bail()
    .isLength({ max })
    .withMessage(`Matn juda uzun (ko'pi bilan ${max} belgi)`);
};
const oneOf = (field, values, msg, required = false) =>
  (required ? body(field) : body(field).optional({ values: 'falsy' })).isIn(values).withMessage(msg);

export const loginRules = validate(
  body('phone').custom(isPhone).withMessage(PHONE_MSG),
  body('password').isString().withMessage('Parol kiritilishi shart').bail().notEmpty().withMessage('Parol kiritilishi shart').isLength({ max: 128 }).withMessage('Parol juda uzun')
);

const fullNameRule = (required) => text('fullName', 100, required, "To'liq ism kiritilishi shart");
const passwordRule = () =>
  body('password')
  .isString()
  .withMessage("Parol kamida 6 belgidan iborat bo'lishi kerak")
  .bail()
  .isLength({ min: 6, max: 128 })
  .withMessage("Parol 6 dan 128 gacha belgidan iborat bo'lishi kerak");

export const createUserRules = validate(
  fullNameRule(true),
  body('phone').custom(isPhone).withMessage(PHONE_MSG),
  passwordRule(),
  oneOf('role', ROLES, "Noto'g'ri rol"),
  oneOf('department', DEPARTMENTS, "Noto'g'ri bo'lim")
);

export const updateUserRules = validate(
  idParam,
  fullNameRule(false),
  body('phone').optional().custom(isPhone).withMessage(PHONE_MSG),
  passwordRule().optional({ values: 'falsy' }),
  oneOf('role', ROLES, "Noto'g'ri rol"),
  oneOf('department', DEPARTMENTS, "Noto'g'ri bo'lim"),
  oneOf('status', ['active', 'inactive'], "Noto'g'ri holat")
);

export const userIdRules = validate(idParam);

const deadlineRule = () => body('deadline').isISO8601().withMessage("Muddat to'g'ri sana bo'lishi kerak");

export const createTaskRules = validate(
  text('title', 200, true, 'Sarlavha kiritilishi shart'),
  text('description', 5000, false, "Tavsif matn bo'lishi kerak"),
  oneOf('priority', PRIORITIES, "Noto'g'ri muhimlik darajasi"),
  body('assignedTo').isInt({ min: 1 }).withMessage('Vazifani xodimga biriktiring'),
  deadlineRule()
);

export const updateTaskRules = validate(
  idParam,
  text('title', 200, false, "Sarlavha bo'sh bo'lishi mumkin emas"),
  text('description', 5000, false, "Tavsif matn bo'lishi kerak"),
  oneOf('priority', PRIORITIES, "Noto'g'ri muhimlik darajasi"),
  body('assignedTo').optional().isInt({ min: 1 }).withMessage("Noto'g'ri xodim"),
  deadlineRule().optional(),
  oneOf('status', TASK_STATUSES, "Noto'g'ri holat"),
  text('rejectionReason', 1000, false, "Rad etish sababi matn bo'lishi kerak")
);

export const taskStatusRules = validate(
  idParam,
  oneOf('status', TASK_STATUSES, "Noto'g'ri holat", true),
  text('rejectionReason', 1000, false, "Rad etish sababi matn bo'lishi kerak"),
  text('reason', 1000, false, "Rad etish sababi matn bo'lishi kerak")
);

export const bulkStatusRules = validate(
  body('ids').isArray({ min: 1, max: 500 }).withMessage('Hech qanday vazifa tanlanmagan'),
  body('ids.*').isInt({ min: 1 }).withMessage("Noto'g'ri ID"),
  oneOf('status', TASK_STATUSES, "Noto'g'ri holat", true)
);

export const createReportRules = validate(
  text('title', 200, true, 'Sarlavha va mazmun kiritilishi shart'),
  text('content', 10000, true, 'Sarlavha va mazmun kiritilishi shart')
);
