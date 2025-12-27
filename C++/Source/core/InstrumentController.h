#pragma once

#include <vector>
#include "SensorSample.h"

// Base class for all instrument controllers
class InstrumentController {
public:
    virtual ~InstrumentController() = default;
    virtual void handle_samples(const SensorSample* left, const SensorSample* right) = 0;
    virtual void calibrate(const std::vector<SensorSample>& left_baseline, 
                          const std::vector<SensorSample>& right_baseline) = 0;
};
