#pragma once

#include <cstdint>
#include<algorithm>
// Sample structure matching Python dict
struct SensorSample {
    uint32_t ts;  // timestamp in milliseconds
    float qw, qx, qy, qz;  // quaternion
    float ax, ay, az;  // accelerometer
    float gx, gy, gz;  // gyroscope
    uint16_t flex_thumb, flex_index, flex_middle, flex_ring, flex_pinky;
    uint16_t fsr;  // FSR value (right hand only)
    
    SensorSample() : ts(0), qw(0), qx(0), qy(0), qz(0),
                    ax(0), ay(0), az(0), gx(0), gy(0), gz(0),
                    flex_thumb(0), flex_index(0), flex_middle(0), 
                    flex_ring(0), flex_pinky(0), fsr(0) {}
};
