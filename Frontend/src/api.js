const API_BASE_URL = "http://127.0.0.1:8000";

export const fetchHealthStatus = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    return await res.json();
  } catch (err) {
    console.error("Error fetching health status:", err);
    return null;
  }
};

export const fetchWorldPoints = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/world-points`);
    return await res.json();
  } catch (err) {
    console.error("Error fetching world points:", err);
    return {};
  }
};

export const fetchNearPoints = async (lat, lng) => {
  try {
    const res = await fetch(`${API_BASE_URL}/near-points`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lat, lng }),
    });
    return await res.json();
  } catch (err) {
    console.error("Error fetching near points:", err);
    return { points: [] };
  }
};