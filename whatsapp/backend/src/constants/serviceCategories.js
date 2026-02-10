/**
 * Service categories available in Ubermench.
 * Each category has an id (used in DB and session), display title, description, and emoji.
 */

const SERVICE_CATEGORIES = [
  {
    id: 'plumbing',
    title: '🔧 Plumbing',
    description: 'Pipes, faucets, drains, water heaters',
  },
  {
    id: 'electrical',
    title: '⚡ Electrical',
    description: 'Wiring, outlets, lighting, panels',
  },
  {
    id: 'cleaning',
    title: '🧹 Cleaning',
    description: 'Home, office, deep cleaning',
  },
  {
    id: 'gardening',
    title: '🌿 Gardening',
    description: 'Lawn care, landscaping, tree trimming',
  },
  {
    id: 'repair',
    title: '🔨 Repair',
    description: 'General handyman, furniture, appliances',
  },
  {
    id: 'other',
    title: '📦 Other',
    description: 'Any other service you need',
  },
];

/**
 * Format categories as WhatsApp interactive list sections
 */
const getServiceListSections = () => {
  return [
    {
      title: 'Available Services',
      rows: SERVICE_CATEGORIES.map((cat) => ({
        id: `service_${cat.id}`,
        title: cat.title,
        description: cat.description,
      })),
    },
  ];
};

/**
 * Find a category by its id
 */
const getCategoryById = (id) => {
  return SERVICE_CATEGORIES.find((cat) => cat.id === id) || null;
};

/**
 * Extract service id from a list reply id (e.g. "service_plumbing" → "plumbing")
 */
const extractServiceId = (listReplyId) => {
  if (!listReplyId || !listReplyId.startsWith('service_')) return null;
  return listReplyId.replace('service_', '');
};

module.exports = {
  SERVICE_CATEGORIES,
  getServiceListSections,
  getCategoryById,
  extractServiceId,
};

