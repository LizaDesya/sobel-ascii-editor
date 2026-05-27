#ifndef MY_IMAGE_LIB
#define MY_IMAGE_LIB
#include <stdlib.h>

typedef struct {
    size_t width;
    size_t height;
    size_t channels;
    double* data;
} image_t;

image_t load_image(const char* file_path);
void free_image(image_t* image);

image_t make_resized(image_t* original, size_t max_width, size_t max_height, double character_ratio);

image_t make_grayscale(image_t* original);

double* get_pixel(image_t* image, size_t x, size_t y);
void set_pixel(image_t* image, size_t x, size_t y, const double* new_pixel);

void get_convolution(image_t* image, double* kernel, double* out);
void get_sobel(image_t* image, double* out_x, double* out_y);

#endif
