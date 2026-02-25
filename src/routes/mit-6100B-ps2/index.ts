import mbta_helpers from "./mbta_helpers.py?raw";
import ps2 from "./ps2.py?raw";
import test_constants from "./test_constants.py?raw";
import test_ps2_student from "./test_ps2_student.py?raw";

const files = {
  "mbta_helpers.py": mbta_helpers,
  "ps2.py": ps2,
  "test_constants.py": test_constants,
  "test_ps2_student.py": test_ps2_student,
};

export default {
  ...files,
  populate: (map: Map<string, string>) => {
    for (const [path, content] of Object.entries(files)) map.set(path, content);
  },
};
